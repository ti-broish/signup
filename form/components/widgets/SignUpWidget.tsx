import React, { useState, useEffect, ChangeEvent, FormEvent, useRef } from 'react';
import { dataApi, submitApi } from '../utils/api';
import { validateCyrillic, validatePhone, validateEGN, validateEmail } from '../utils/validation';
import { generateReferralCode, getReferralFromUrl } from '../utils/referral';

import '../style/SignUpWidget.css';
import SignUpSuccess from './SignUpSuccess';

const useIframeHeight = () => {
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;

    const root = document.getElementById('root');
    if (!root) return;

    const sendHeight = () => {
      const height = root.scrollHeight;
      window.parent.postMessage(
        { type: "tibroishIframeHeight", height },
        "*",
      );
    };

    const observer = new ResizeObserver(() => sendHeight());
    observer.observe(root);

    sendHeight();

    return () => observer.disconnect();
  }, []);
};

interface Country {
  code: string;
  name: string;
  isAbroad: boolean;
}

// 'Община / Район'
interface Municipality {
  code: string;
  name: string;
}

// Област
interface Region {
  code: string;
  name: string;
  isAbroad?: boolean;
  municipalities?: Municipality[];
}

// Населено място
interface Settlement {
  id: number;
  name: string;
  cityRegions: CityRegion[];
}

// Район
interface CityRegion {
  code: string;
  name: string;
}

// Секция
interface PollingStation {
  id: string;
  code: string;
  place: string;
  riskLevel: string;
  town: Settlement
}

interface FormData {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  egn: string;
  idCardNumber: string;
  permanentAddress: string;
  country: Country | null;
  region: Region | null;
  municipality: Municipality | null;
  settlement: Settlement | null;
  cityRegion: CityRegion | null;
  pollingStation: PollingStation | string | null;
  travelAbility: 'no' | 'settlement' | 'municipality' | 'region' | 'distant';
  distantOblasts?: string;
  riskySections: boolean;
  gdprConsent: boolean;
  role: 'poll_watcher' | 'video_surveillance';
}

interface FormErrors {
  [key: string]: string;
}

interface TouchedFields {
  [key: string]: boolean;
}

interface SignUpWidgetProps {
  privacyUrl?: string;
}

/**
 * Notify parent window that form submission was successful
 * Uses postMessage for cross-origin communication and tries to call a function for same-origin
 */
const notifyParentSubmitSuccess = () => {
  try {
    // Send postMessage to parent window (works for cross-origin)
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage('tibroishSubmitSuccess', '*');
    }
  } catch (e) {
    console.warn('Could not send postMessage to parent:', e);
  }

  try {
    // Try to call a function on parent window if it exists (for same-origin or secure contexts)
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      const parentWindow = window.parent as any;
      if (typeof parentWindow.tibroishSubmitSuccess === 'function') {
        parentWindow.tibroishSubmitSuccess();
      }
    }
  } catch (e) {
    // Cross-origin restriction - this is expected and safe to ignore
    // postMessage will handle cross-origin communication
  }
};

const getIsObserverFromUrl = () => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('role') === 'observer';
  } catch (e) {
    return false;
  }
};

const SignUpWidget: React.FC<SignUpWidgetProps> = ({ privacyUrl }) => {
  useIframeHeight();
  // Get privacy URL from env var or prop, default to https://tibroish.bg/privacy-notice
  const effectivePrivacyUrl = privacyUrl ||
    (typeof process !== 'undefined' && process.env?.VITE_PRIVACY_URL) ||
    'https://tibroish.bg/privacy-notice';
  const ABROAD_ID = '32'; // ID за "Извън страната"
  const BULGARIA_ID = '000'; // ID за "България"
  const STORAGE_KEY = 'signup-form-draft';

  const isObserver = getIsObserverFromUrl();

  // Sofia MIR region codes (stable identifiers)
  const SOFIA_MIR_CODES = ['23', '24', '25'];
  const isSofiaMirRegion = (region: Region) => SOFIA_MIR_CODES.includes(region.code);

  // Disable Turnstile in local development
  const isLocalDev = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.includes('.local')
  );

  // Read Turnstile site key from process.env (replaced at build time by Vite)
  // Vite replaces process.env.VITE_TURNSTILE_SITE_KEY with the actual string value
  const turnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY || '';

  // Add turnstile refs
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const hasRestoredPersistedData = useRef<boolean>(false);
  const isRestoringData = useRef<boolean>(false);
  const successMessageRef = useRef<HTMLDivElement>(null);
  const hasScrolledToSuccess = useRef<boolean>(false);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    egn: '',
    idCardNumber: '',
    permanentAddress: '',
    country: null,
    region: null,
    municipality: null,
    settlement: null,
    cityRegion: null,
    pollingStation: null,
    travelAbility: 'no',
    distantOblasts: '',
    riskySections: false,
    gdprConsent: false,
    role: 'video_surveillance'
  });

  const roleRequires = (field: 'egn' | 'travelAbility' | 'riskySections') => {
    const pollWatcherOnly = ['egn', 'travelAbility', 'riskySections'];
    return !pollWatcherOnly.includes(field) || formData.role === 'poll_watcher';
  };

  // API data state
  const [regions, setRegions] = useState<Region[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [pollingStations, setPollingStations] = useState<PollingStation[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);

  // Sofia MIR merge state
  const [sofiaCityRegionToMir, setSofiaCityRegionToMir] = useState<Map<string, Region>>(new Map());
  const [mergedSofiaRegion, setMergedSofiaRegion] = useState<Region | null>(null);
  const [displayRegions, setDisplayRegions] = useState<Region[]>([]);
  const [actualRegionForApi, setActualRegionForApi] = useState<Region | null>(null);

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string>('');
  const [submittedReferralCode, setSubmittedReferralCode] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const isAbroad = formData.region?.code === ABROAD_ID;

  // Tracking states
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Load Turnstile script (skip in local development)
  useEffect(() => {
    if (isLocalDev) {
      // Auto-set token for local development
      setTurnstileToken('local-dev-token');
      return;
    }

    // Check if script already exists
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log('Turnstile script loaded successfully');
    };

    script.onerror = (error) => {
      console.error('Failed to load Turnstile script:', error);
      setErrors(prev => ({
        ...prev,
        turnstile: 'Не може да се зареди скриптът за валидация. Моля опитайте отново.'
      }));
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [isLocalDev]);

  // Initialize Turnstile widget (skip in local development or if site key is missing)
  useEffect(() => {
    if (isLocalDev) {
      return; // Skip Turnstile initialization in local dev
    }

    // Skip if site key is not set
    if (!turnstileSiteKey || turnstileSiteKey.trim() === '' || turnstileSiteKey === 'TURNSTILE_SITE_KEY') {
      console.warn('Turnstile site key is not set. Skipping Turnstile initialization.');
      // Auto-set token so form can be submitted without Turnstile
      setTurnstileToken('no-turnstile');
      return;
    }

    // Wait for ref to be available - don't return early, let the polling handle it
    // The renderTurnstile function checks for turnstileRef.current, so it's safe

    const renderTurnstile = () => {
      if (window.turnstile && !widgetIdRef.current && turnstileRef.current) {
        try {
          console.log('Rendering Turnstile with site key:', turnstileSiteKey.substring(0, 10) + '...');
          widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
            sitekey: turnstileSiteKey,
            callback: (token: string) => {
              console.log('Turnstile callback received, token length:', token.length);
              setTurnstileToken(token);
              setErrors(prev => {
                const { turnstile, ...rest } = prev;
                return rest;
              });
            },
            'error-callback': () => {
              console.error('Turnstile error callback:');
              setTurnstileToken(null);
              setErrors(prev => ({
                ...prev,
                turnstile: 'Грешка при валидацията. Моля опитайте отново.'
              }));
            },
            'expired-callback': () => {
              console.log('Turnstile expired');
              setTurnstileToken(null);
              setErrors(prev => ({
                ...prev,
                turnstile: 'Валидацията изтече. Моля опитайте отново.'
              }));
            },
            theme: 'light',
            size: 'normal',
            language: 'bg'
          });
          console.log('Turnstile widget rendered, ID:', widgetIdRef.current);
        } catch (error) {
          console.error('Error rendering Turnstile:', error);
          setErrors(prev => ({
            ...prev,
            turnstile: 'Грешка при инициализация на валидацията.'
          }));
        }
      } else {
        console.log('Turnstile render conditions:', {
          hasTurnstile: !!window.turnstile,
          hasWidgetId: !!widgetIdRef.current,
          hasRef: !!turnstileRef.current
        });
      }
    };

    // Wait for Turnstile script to load (with timeout)
    let timeoutId: NodeJS.Timeout;
    let checkInterval: NodeJS.Timeout;

    const attemptRender = () => {
      if (!turnstileRef.current) {
        console.log('Turnstile ref not ready yet');
        return false;
      }
      if (!window.turnstile) {
        console.log('Turnstile script not loaded yet');
        return false;
      }
      if (widgetIdRef.current) {
        console.log('Turnstile widget already rendered');
        return true;
      }
      renderTurnstile();
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
      return true;
    };

    if (attemptRender()) {
      // Already available
      return;
    }

    // Poll for Turnstile availability
    checkInterval = setInterval(() => {
      if (attemptRender()) {
        // Successfully rendered
      }
    }, 100);

    // Timeout after 15 seconds
    timeoutId = setTimeout(() => {
      if (checkInterval) clearInterval(checkInterval);
      if (!widgetIdRef.current) {
        console.error('Turnstile failed to load after 15 seconds', {
          turnstileAvailable: !!window.turnstile,
          refAvailable: !!turnstileRef.current,
          siteKey: turnstileSiteKey ? turnstileSiteKey.substring(0, 10) + '...' : 'missing'
        });
        setErrors(prev => ({
          ...prev,
          turnstile: 'Валидацията не може да се зареди. Моля опитайте отново или обновете страницата.'
        }));
      }
    }, 15000);

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [turnstileSiteKey, isLocalDev]);

  // Load persisted form data from localStorage
  const loadPersistedFormData = (): Partial<FormData> | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading persisted form data:', error);
    }
    return null;
  };

  // Save form data to localStorage
  const saveFormDataToStorage = (data: FormData) => {
    try {
      // Only save if form has some data
      const hasData = data.firstName || data.lastName || data.email || data.phone || data.egn || data.idCardNumber || data.permanentAddress;
      if (hasData) {
        // Save actual MIR region instead of merged Sofia for proper restoration
        let dataToSave = data;
        if (data.region?.code === 'sofia-merged') {
          const sofiaRegion = actualRegionForApi || regions.find(r => isSofiaMirRegion(r));
          if (sofiaRegion) {
            dataToSave = { ...data, region: sofiaRegion };
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Error saving form data to localStorage:', error);
    }
  };

  // Clear persisted form data
  const clearPersistedFormData = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing persisted form data:', error);
    }
  };

  // Generate referral code on mount
  useEffect(() => {
    const code = generateReferralCode();
    setReferralCode(code);
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchRegions();
    fetchCountries();
  }, []);

  // Load persisted form data after regions and countries are loaded
  useEffect(() => {
    if (regions.length > 0 && countries.length > 0 && !hasRestoredPersistedData.current) {
      const persistedData = loadPersistedFormData();
      if (persistedData) {
        hasRestoredPersistedData.current = true;
        isRestoringData.current = true;

        // Restore form data, matching region/municipality/settlement objects with loaded data
        const restoredData: Partial<FormData> = { ...persistedData };

        // Match region
        if (persistedData.region?.code) {
          const matchedRegion = regions.find(r => r.code === persistedData.region?.code);
          if (matchedRegion) {
            // Check if this is a Sofia MIR region — display as merged Sofia
            if (isSofiaMirRegion(matchedRegion) && mergedSofiaRegion) {
              restoredData.region = mergedSofiaRegion;
              setActualRegionForApi(matchedRegion);
              // Match municipality from merged Sofia's municipalities
              if (persistedData.municipality?.code && mergedSofiaRegion.municipalities) {
                const matchedMunicipality = mergedSofiaRegion.municipalities.find(
                  m => m.code === persistedData.municipality?.code
                );
                if (matchedMunicipality) {
                  restoredData.municipality = matchedMunicipality;
                }
              }
            } else {
              restoredData.region = matchedRegion;
              // Match municipality if region has municipalities
              if (persistedData.municipality?.code && matchedRegion.municipalities) {
                const matchedMunicipality = matchedRegion.municipalities.find(
                  m => m.code === persistedData.municipality?.code
                );
                if (matchedMunicipality) {
                  restoredData.municipality = matchedMunicipality;
                }
              }
            }
          }
        }

        // Match country
        if (persistedData.country?.code) {
          const matchedCountry = countries.find(c => c.code === persistedData.country?.code);
          if (matchedCountry) {
            restoredData.country = matchedCountry;
          }
        }

        setFormData(prev => ({ ...prev, ...restoredData, role: 'video_surveillance' }));

        // Trigger settlement fetch if municipality is restored
        // Fetch settlements immediately with persisted ID to ensure proper restoration
        if (restoredData.municipality && restoredData.region && restoredData.region.code !== ABROAD_ID) {
          const persistedSettlementId = persistedData.settlement && typeof persistedData.settlement === 'object'
            ? persistedData.settlement.id
            : undefined;
          const persistedPollingStationId = persistedData.pollingStation && typeof persistedData.pollingStation === 'object'
            ? persistedData.pollingStation.id
            : undefined;

          // Fetch settlements immediately (don't wait for useEffect)
          // Pass region code explicitly — use persisted (actual MIR) code, not merged Sofia code
          const regionCodeForFetch = persistedData.region?.code || restoredData.region.code;
          fetchSettlements(restoredData.municipality.code, persistedSettlementId, regionCodeForFetch).then(() => {
            // After settlements are loaded and matched, fetch polling stations if needed
            if (persistedPollingStationId && persistedSettlementId) {
              // Use the persisted settlement ID directly
              setTimeout(() => {
                fetchPollingStations(persistedSettlementId.toString(), persistedPollingStationId);
              }, 100);
            }
            // Mark restoration as complete
            isRestoringData.current = false;
          });
        } else {
          isRestoringData.current = false;
        }
      }
    }
  }, [regions, countries, mergedSofiaRegion]);

  // Scroll to top when success message appears (only once)
  useEffect(() => {
    if (isSubmitted && submittedReferralCode && !hasScrolledToSuccess.current) {
      // Use setTimeout to ensure DOM has updated and success message is rendered
      const timer = setTimeout(() => {
        if (hasScrolledToSuccess.current) return; // Prevent double scroll

        try {
          hasScrolledToSuccess.current = true;

          // Scroll the success message into view at the top of current frame
          if (successMessageRef.current) {
            successMessageRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          } else {
            // Fallback: scroll current window to top
            window.scrollTo({
              top: 0,
              behavior: 'smooth'
            });
          }

          // Ask parent to scroll to top via postMessage (cross-origin safe)
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'tibroishScrollToTop' }, '*');
          }
        } catch (e) {
          // Ignore scroll errors
          console.warn('Scroll to top failed:', e);
        }
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [isSubmitted, submittedReferralCode]);

  // Real-time validation with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      validateForm(false); // Validate without setting all as touched
    }, 500);

    return () => clearTimeout(timer);
  }, [formData]);

  // Save form data to localStorage on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveFormDataToStorage(formData);
    }, 500);

    return () => clearTimeout(timer);
  }, [formData]);

  // Fetch regions from API
  const fetchRegions = async () => {
    try {
      setLoading(true);
      const data = await dataApi.get<never, Region[]>('election_regions');
      setRegions(data);

      // Merge Sofia MIR regions (23, 24, 25) into a single "София-град" option
      const sofiaRegions = data.filter(r => isSofiaMirRegion(r));
      const nonSofiaRegions = data.filter(r => !isSofiaMirRegion(r));

      if (sofiaRegions.length > 1) {
        // Deduplicate municipalities (all 3 MIRs share "Столична")
        const seenMunicipalityCodes = new Set<string>();
        const uniqueSofiaMunicipalities: Municipality[] = [];
        for (const region of sofiaRegions) {
          for (const muni of region.municipalities || []) {
            if (!seenMunicipalityCodes.has(muni.code)) {
              seenMunicipalityCodes.add(muni.code);
              uniqueSofiaMunicipalities.push(muni);
            }
          }
        }
        uniqueSofiaMunicipalities.sort((a, b) => a.name.localeCompare(b.name, 'bg'));

        const merged: Region = {
          code: 'sofia-merged',
          name: 'София-град',
          municipalities: uniqueSofiaMunicipalities
        };

        setMergedSofiaRegion(merged);
        setDisplayRegions([...nonSofiaRegions, merged].sort((a, b) =>
          a.name.localeCompare(b.name, 'bg')
        ));
      } else {
        setDisplayRegions(data);
      }

      if (data.length === 1) {
        setFormData(prev => ({ ...prev, region: data[0] }));
      }
    } catch (error) {
      console.error('Error fetching regions:', error);
      setErrors(prev => ({ ...prev, api: 'Грешка при зареждане на данните' }));
    } finally {
      setLoading(false);
    }
  };

  // Fetch countries
  const fetchCountries = async () => {
    const countriesList: Country[] = await dataApi.get<never, Country[]>('countries');
    // sort by name
    countriesList.sort((a, b) => a.name.localeCompare(b.name, 'bg'));
    setCountries(countriesList);
    if (countriesList.length === 1) {
      setFormData(prev => ({ ...prev, country: countriesList[0] }));
    }
  };

  // Update municipalities when region changes
  useEffect(() => {
    if (formData.region && formData.region.code !== ABROAD_ID) {
      if (formData.region.municipalities) {
        setMunicipalities(formData.region.municipalities);
        if (formData.region.municipalities.length === 1) {
          setFormData(prev => ({ ...prev, municipality: formData.region!.municipalities![0] }));
        }
      } else {
        setMunicipalities([]);
      }
    } else {
      setMunicipalities([]);
      setSettlements([]);
      setPollingStations([]);
    }

  }, [formData.region]);

  // Fetch settlements when municipality changes
  useEffect(() => {
    // Skip if we're currently restoring persisted data
    if (isRestoringData.current) {
      return;
    }

    if (formData.municipality && formData.region && formData.region.code !== ABROAD_ID) {
      fetchSettlements(formData.municipality.code);
    } else if (formData.region?.code !== ABROAD_ID) {
      setSettlements([]);
    }
  }, [formData.municipality]);

  const fetchSettlements = async (municipalityId: string, persistedSettlementId?: number, regionCode?: string) => {
    try {
      const isSofia = formData.region?.code === 'sofia-merged' || (regionCode && SOFIA_MIR_CODES.includes(regionCode));

      let data: Settlement[];
      let cityRegionMap: Map<string, Region> | null = null;
      if (isSofia) {
        // Fetch from all 3 Sofia MIRs and merge city regions
        const allResults = await Promise.all(
          SOFIA_MIR_CODES.map(code =>
            dataApi.get<never, Settlement[]>(`towns?country=${BULGARIA_ID}&election_region=${code}&municipality=${municipalityId}`)
              .then(settlements => ({ code, settlements }))
          )
        );

        // Build city region → MIR mapping and merge settlements
        cityRegionMap = new Map<string, Region>();
        const mergedById = new Map<number, Settlement>();

        for (const { code, settlements: mirSettlements } of allResults) {
          const mirRegion = regions.find(r => r.code === code);
          for (const s of mirSettlements) {
            if (mergedById.has(s.id)) {
              // Same settlement in multiple MIRs — merge city regions
              const existing = mergedById.get(s.id)!;
              for (const cr of s.cityRegions) {
                if (!existing.cityRegions.some(ecr => ecr.code === cr.code)) {
                  existing.cityRegions.push(cr);
                }
                if (mirRegion) {
                  cityRegionMap.set(cr.code, mirRegion);
                }
              }
            } else {
              mergedById.set(s.id, { ...s, cityRegions: [...s.cityRegions] });
              if (mirRegion) {
                for (const cr of s.cityRegions) {
                  cityRegionMap.set(cr.code, mirRegion);
                }
              }
            }
          }
        }

        setSofiaCityRegionToMir(cityRegionMap);
        data = Array.from(mergedById.values());
      } else {
        const regionId = regionCode || actualRegionForApi?.code || formData.region?.code;
        data = await dataApi.get<never, Settlement[]>(`towns?country=${BULGARIA_ID}&election_region=${regionId}&municipality=${municipalityId}`);
      }

      setSettlements(data);

      if (data.length === 1) {
        const settlement = data[0];
        const cityRegion = settlement.cityRegions.length === 1 ? settlement.cityRegions[0] : null;
        setFormData(prev => ({
          ...prev,
          settlement,
          cityRegion
        }));
      } else if (data.length > 1 && !persistedSettlementId) {
        // Auto-select the settlement with the most city regions (districts),
        // or the single city if there's exactly one
        const withCityRegions = data.filter(s => s.cityRegions.length > 1);
        const cities = data.filter(s => s.name.startsWith('гр.'));
        let autoSelect: Settlement | null = null;
        if (withCityRegions.length === 1) {
          autoSelect = withCityRegions[0];
        } else if (withCityRegions.length > 1) {
          // Multiple settlements with city regions (e.g. merged Sofia MIRs where
          // a village like с. Яна spans two MIRs) — pick the one with the most
          autoSelect = withCityRegions.reduce((a, b) => a.cityRegions.length >= b.cityRegions.length ? a : b);
        } else if (cities.length === 1) {
          autoSelect = cities[0];
        }
        if (autoSelect) {
          const cityRegion = autoSelect.cityRegions.length === 1 ? autoSelect.cityRegions[0] : null;
          setFormData(prev => ({
            ...prev,
            settlement: autoSelect,
            cityRegion
          }));
        }
      } else if (persistedSettlementId) {
        // Match persisted settlement
        const matchedSettlement = data.find(s => s.id === persistedSettlementId);
        if (matchedSettlement) {
          const persistedData = loadPersistedFormData();
          let matchedCityRegion = null;
          if (persistedData?.cityRegion?.name && matchedSettlement.cityRegions.length > 0) {
            matchedCityRegion = matchedSettlement.cityRegions.find(
              cr => cr.name === persistedData.cityRegion?.name
            ) || null;
          }
          // Resolve actual MIR from restored city region (for Sofia)
          if (matchedCityRegion && isSofia) {
            const mirRegion = cityRegionMap?.get(matchedCityRegion.code);
            if (mirRegion) {
              setActualRegionForApi(mirRegion);
            }
          }
          setFormData(prev => ({
            ...prev,
            settlement: matchedSettlement,
            cityRegion: matchedCityRegion
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching settlements:', error);
    }
  };

  // Fetch PollingStations when settlement changes
  useEffect(() => {
    if (formData.municipality && formData.region && formData.settlement && formData.region.code !== ABROAD_ID) {
      fetchPollingStations(formData.settlement.id.toString());
    } else if (formData.region?.code !== ABROAD_ID) {
      setPollingStations([]);
    }
  }, [formData.settlement, formData.cityRegion]);

  // Normalize address formatting: ensure proper spacing
  const normalizeAddress = (address: string): string => {
    if (!address) return address;

    // First, normalize quotes by tracking quote state
    let insideQuotes = false;
    let normalized = '';

    for (let i = 0; i < address.length; i++) {
      const char = address[i];
      const prevChar = i > 0 ? address[i - 1] : '';
      const nextChar = i < address.length - 1 ? address[i + 1] : '';

      if (char === '"') {
        // Check if this is an opening quote (we're not inside quotes yet)
        if (!insideQuotes) {
          // Opening quote - add space before if needed
          if (prevChar && prevChar !== ' ' && prevChar !== '(') {
            normalized += ' ';
          }
          normalized += char;
          insideQuotes = true;
        } else {
          // Closing quote - add space after if needed
          normalized += char;
          if (nextChar && nextChar !== ' ' && nextChar !== ',' && nextChar !== '.') {
            normalized += ' ';
          }
          insideQuotes = false;
        }
      } else {
        normalized += char;
      }
    }

    return normalized
      // Add space after comma if missing
      .replace(/,([^\s])/g, ', $1')
      // Add space after dot if missing (but not if followed by digit, comma, dot, or space)
      .replace(/\.([^\s\d,\.])/g, '. $1')
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Helper function to compare already-stripped addresses with tolerance for minor differences
  const addressesMatchStripped = (stripped1: string, stripped2: string): boolean => {
    // If exact match, they match
    if (stripped1 === stripped2) return true;

    // Quick length check - if difference is more than 2 characters, can't match
    const lenDiff = Math.abs(stripped1.length - stripped2.length);
    if (lenDiff > 2) return false;

    // Use optimized Levenshtein distance with early exit
    return levenshteinDistanceOptimized(stripped1, stripped2) <= 2;
  };

  // Optimized Levenshtein distance with early exit when distance > 2
  const levenshteinDistanceOptimized = (str1: string, str2: string): number => {
    const len1 = str1.length;
    const len2 = str2.length;

    // Use only two rows instead of full matrix (space optimization)
    let prevRow = Array(len2 + 1).fill(0).map((_, i) => i);
    let currRow = Array(len2 + 1).fill(0);

    for (let i = 1; i <= len1; i++) {
      currRow[0] = i;
      let minInRow = i;

      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,        // deletion
          currRow[j - 1] + 1,    // insertion
          prevRow[j - 1] + cost  // substitution
        );
        minInRow = Math.min(minInRow, currRow[j]);
      }

      // Early exit: if minimum in current row is > 2, distance will be > 2
      if (minInRow > 2) return 3;

      // Swap rows
      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[len2];
  };

  const fetchPollingStations = async (settlementId: string, persistedPollingStationId?: string) => {
    try {
      const data = await dataApi.get<never, PollingStation[]>(`sections?town=${settlementId}${formData.cityRegion ? `&city_region=${formData.cityRegion.code}` : ''}`);

      // Filter duplicates by place (normalized with tolerance for minor differences)
      // Compare stripped addresses, but keep original addresses for display/submission
      const stripWhitespace = (s: string) => s.replace(/\s+/g, '');
      const uniqueData: PollingStation[] = [];
      const processedStripped = new Set<string>();

      for (const station of data) {
        const strippedPlace = stripWhitespace(station.place);

        // Check if we've already seen a similar address (using stripped comparison)
        let matched = false;
        for (const seenStripped of processedStripped) {
          if (addressesMatchStripped(seenStripped, strippedPlace)) {
            matched = true;
            break;
          }
        }

        if (!matched) {
          // This is a new unique address - normalize it and add it
          const normalizedStation = {
            ...station,
            place: normalizeAddress(station.place)
          };
          uniqueData.push(normalizedStation);
          processedStripped.add(strippedPlace);
        }
      }

      setPollingStations(uniqueData);

      if (uniqueData.length === 1) {
        setFormData(prev => ({
          ...prev,
          pollingStation: uniqueData[0],
          // Auto-select travel within settlement when only one station (only if not already set by user)
          travelAbility: prev.travelAbility === 'no' ? 'settlement' : prev.travelAbility
        }));
      } else if (persistedPollingStationId) {
        // Match persisted polling station
        const matchedStation = uniqueData.find(s => s.id === persistedPollingStationId);
        if (matchedStation) {
          setFormData(prev => ({ ...prev, pollingStation: matchedStation }));
        }
      }
    } catch (error) {
      console.error('Error fetching settlements:', error);
    }
  };


  // Master validation function
  const validateForm = (setAllTouched = false) => {
    const newErrors: FormErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Полето е задължително';
    } else if (!validateCyrillic(formData.firstName)) {
      newErrors.firstName = 'Името трябва да е на кирилица';
    }


    if (!formData.middleName.trim()) {
      newErrors.middleName = 'Полето е задължително';
    } else if (!validateCyrillic(formData.middleName)) {
      newErrors.middleName = 'Презимето трябва да е на кирилица';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Полето е задължително';
    } else if (!validateCyrillic(formData.lastName)) {
      newErrors.lastName = 'Фамилията трябва да е на кирилица';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Полето е задължително';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Невалиден имейл адрес';
    }

    if (!formData.phone) {
      newErrors.phone = 'Полето е задължително';
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = 'Невалиден телефонен номер';
    }

    // Only validate EGN if:
    // 1. Role requires it (poll_watcher), OR
    // 2. User provided an EGN value (optional validation for video_surveillance)
    if (roleRequires('egn') || formData.egn.trim()) {
      const egnVal = validateEGN(formData.egn);
      if (!egnVal.valid) {
        newErrors.egn = egnVal.message || 'Невалиден ЕГН';
      }
    }

    if (isObserver && formData.role === 'poll_watcher') {
      if (!formData.idCardNumber.trim()) {
        newErrors.idCardNumber = 'Полето е задължително';
      }
      if (!formData.permanentAddress.trim()) {
        newErrors.permanentAddress = 'Полето е задължително';
      }
    }

    if (!formData.region) newErrors.region = 'Полето е задължително';

    if (formData.region && formData.region.code !== ABROAD_ID) {
      if (!formData.municipality) newErrors.municipality = 'Полето е задължително';
      if (!formData.settlement) newErrors.settlement = 'Полето е задължително';
    }

    if (formData.region?.code === ABROAD_ID) {
      if (!formData.country) newErrors.country = 'Полето е задължително';
      if (!formData.settlement?.name.trim()) newErrors.settlement = 'Полето е задължително';
    }

    if (!formData.gdprConsent) {
      newErrors.gdprConsent = 'Трябва да приемете условията';
    }

    // Validate distantOblasts when travelAbility is 'distant' and not abroad
    if (roleRequires('travelAbility') && formData.travelAbility === 'distant' && !isAbroad && !formData.distantOblasts?.trim()) {
      newErrors.distantOblasts = 'Моля посочете кои области';
    }

    // Turnstile validation (skip in local development)
    if (!isLocalDev && !turnstileToken) {
      newErrors.turnstile = 'Моля потвърдете, че не сте робот';
    }

    setErrors(newErrors);

    if (setAllTouched) {
      const allTouched: TouchedFields = {};
      Object.keys(formData).forEach(key => allTouched[key] = true);
      allTouched.turnstile = true;
      setTouched(allTouched);
    }

    return Object.keys(newErrors).length === 0;
  };

  // Events
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;

    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    }

    if (name === 'travelAbility') {
      // Treat the checkboxes as a slider:
      // clicking any level selects exactly that level;
      // clicking an already-selected level unchecks it (goes back one level)
      // everything above it appears checked, everything below unchecked.
      const targetLevel = value;
      const isAbroad = formData.region?.code === ABROAD_ID;
      const isSofiaGrad = formData.region?.code === 'sofia-merged';
      const hierarchy = isAbroad
        ? ['no', 'settlement', 'region', 'distant']
        : (isSofiaGrad
          ? ['no', 'settlement', 'municipality', 'distant']
          : ['no', 'settlement', 'municipality', 'region', 'distant']);

      const currentIndex = hierarchy.indexOf(formData.travelAbility);
      const targetIndex = hierarchy.indexOf(targetLevel);

      // If clicking on the currently selected level, go back one level (or to 'no' if at first level)
      let newLevel = targetLevel;
      if (currentIndex === targetIndex && currentIndex > 0) {
        newLevel = hierarchy[currentIndex - 1];
      }

      setFormData(prev => ({
        ...prev,
        travelAbility: newLevel as any,
        // Clear distantOblasts when travelAbility changes away from 'distant'
        distantOblasts: newLevel === 'distant' ? prev.distantOblasts : ''
      }));
      return;
    }

    if (name === 'phone') {
      finalValue = value.replace(/[^\d+]/g, '');
    }

    if (name === 'egn') {
      finalValue = value.replace(/[^\d]/g, '');
    }

    if (name === 'region') {
      // Handle merged Sofia region
      let region: Region | null;
      if (value === 'sofia-merged' && mergedSofiaRegion) {
        region = mergedSofiaRegion;
      } else {
        region = regions.find(r => r.code === value) || null;
      }
      setActualRegionForApi(null);
      setFormData(prev => ({
        ...prev,
        region,
        municipality: null,
        settlement: null,
        pollingStation: null,
        travelAbility: 'no', // Reset travel ability when location changes
        distantOblasts: '' // Reset distant oblasts when location changes
      }));
      setTouched(prev => ({
        ...prev,
        municipality: false,
        settlement: false,
        cityRegion: false,
        pollingStation: false
      }));
    } else if (name === 'municipality') {
      const municipality = municipalities.find(m => m.code === value) || null;
      setFormData(prev => ({
        ...prev,
        municipality,
        settlement: null,
        pollingStation: null,
        travelAbility: 'no', // Reset travel ability when location changes
        distantOblasts: '' // Reset distant oblasts when location changes
      }));
      setTouched(prev => ({
        ...prev,
        settlement: false,
        cityRegion: false,
        pollingStation: false
      }));
    } else if (name === 'country') {
      const country = countries.find(c => c.code === value) || null;
      setFormData(prev => ({
        ...prev,
        country,
        travelAbility: 'no', // Reset travel ability when location changes
        distantOblasts: '' // Reset distant oblasts when location changes
      }));
    } else if (name === 'settlement') {
      if (isAbroad) {
        setFormData(prev => ({
          ...prev,
          settlement: { id: 0, name: value, cityRegions: [] },
          pollingStation: null,
          travelAbility: 'no', // Reset travel ability when location changes
          distantOblasts: '' // Reset distant oblasts when location changes
        }));
      } else {
        const settlement = settlements.find(s => s.id.toString() === value) || null;
        const cityRegion = settlement && settlement.cityRegions.length === 1 ? settlement.cityRegions[0] : null;
        setFormData(prev => ({
          ...prev,
          settlement,
          cityRegion,
          pollingStation: null,
          travelAbility: 'no', // Reset travel ability when location changes
          distantOblasts: '' // Reset distant oblasts when location changes
        }));
        setTouched(prev => ({
          ...prev,
          cityRegion: false,
          pollingStation: false
        }));
      }
    } else if (name === 'cityRegion') {
      const cityRegion = (formData.settlement?.cityRegions || []).find(cr => cr.name === value) || null;
      // Resolve actual MIR region from city region (for Sofia)
      if (cityRegion && sofiaCityRegionToMir.has(cityRegion.code)) {
        setActualRegionForApi(sofiaCityRegionToMir.get(cityRegion.code) || null);
      }
      setFormData(prev => ({
        ...prev,
        cityRegion,
        pollingStation: null,
        travelAbility: 'no', // Reset travel ability when location changes
        distantOblasts: '' // Reset distant oblasts when location changes
      }));
    } else if (name === 'pollingStation') {
      if (isAbroad) {
        // For abroad, normalize the manually entered address
        const normalizedAddress = normalizeAddress(finalValue);
        setFormData(prev => ({ ...prev, pollingStation: normalizedAddress }));
      } else {
        // For Bulgaria, find the selected polling station
        const pollingStation = pollingStations.find(ps => ps.id.toString() === value) || null;
        setFormData(prev => ({ ...prev, pollingStation }));
      }
    } else if (name === 'riskySections' || name === 'gdprConsent') {
      // Explicitly handle boolean checkboxes to ensure correct boolean value
      setFormData(prev => ({ ...prev, [name]: Boolean(finalValue) }));
    } else if (name === 'role') {
      setFormData(prev => ({
        ...prev,
        role: finalValue,
        // Clear EGN when switching away from poll_watcher since the field is hidden
        egn: finalValue === 'poll_watcher' ? prev.egn : ''
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: finalValue }));
    }

    // Clear error immediately when user starts typing/checking to avoid "flashing" or stale errors
    setErrors(prev => ({ ...prev, [name]: '' }));

    // For GDPR consent, show/clear error immediately on toggle
    if (name === 'gdprConsent') {
      setTouched(prev => ({ ...prev, gdprConsent: true }));
      if (finalValue === true) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.gdprConsent;
          return newErrors;
        });
      } else {
        setErrors(prev => ({ ...prev, gdprConsent: 'Трябва да приемете условията' }));
      }
    }
  };

  const handleBlur = (name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    // Save to localStorage immediately on blur
    saveFormDataToStorage(formData);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm(true)) {
      return;
    }

    try {
      // Get referral code from URL if present
      const referredBy = getReferralFromUrl();

      // Prepare submission data - convert objects to strings for database
      // Normalize polling station address
      const pollingStationString = typeof formData.pollingStation === 'string'
        ? normalizeAddress(formData.pollingStation)
        : formData.pollingStation?.place
          ? normalizeAddress(formData.pollingStation.place)
          : null;

      // Convert role to Bulgarian string
      const roleMap: Record<string, string> = {
        'poll_watcher': 'Пазител на вота в секция',
        'video_surveillance': 'Видеонаблюдение от вкъщи'
      };
      const roleString = roleMap[formData.role] || formData.role;

      // Convert travelAbility to Bulgarian string (simplified, without customization)
      const travelAbilityMap: Record<string, string> = {
        'no': 'Само където гласувам',
        'settlement': 'В рамките на населеното място',
        'municipality': 'В рамките на общината',
        'region': 'В рамките на областта',
        'distant': isAbroad ? 'В други държави' : 'В други области'
      };
      let travelAbilityString = travelAbilityMap[formData.travelAbility] || formData.travelAbility;
      // Append oblasts information if provided
      if (formData.travelAbility === 'distant' && !isAbroad && formData.distantOblasts?.trim()) {
        travelAbilityString += ` (${formData.distantOblasts.trim()})`;
      }

      // Default country to България if not set
      const countryString = formData.country?.name || 'България';

      const submissionData = {
        firstName: formData.firstName,
        middleName: formData.middleName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        egn: formData.egn,
        country: countryString,
        region: actualRegionForApi?.name || formData.region?.name || null,
        municipality: formData.municipality?.name || null,
        settlement: formData.settlement?.name || null,
        cityRegion: formData.cityRegion?.name || null,
        pollingStation: pollingStationString,
        travelAbility: roleRequires('travelAbility') ? travelAbilityString : '',
        distantOblasts: roleRequires('travelAbility') ? (formData.distantOblasts?.trim() || '') : '',
        riskySections: roleRequires('riskySections') ? formData.riskySections : false,
        gdprConsent: formData.gdprConsent,
        role: roleString,
        turnstileToken: isLocalDev ? 'local-dev-token' : turnstileToken,
        referralCode: referralCode,
        referredBy: referredBy || null,
        ...(isObserver && {
          isObserver: true,
          ...(formData.role === 'poll_watcher' && {
            idCardNumber: formData.idCardNumber,
            permanentAddress: formData.permanentAddress,
          }),
        }),
      };

      // Get submission endpoint from environment variable, default to /submit
      const submitEndpoint = (typeof process !== 'undefined' && process.env?.VITE_SUBMIT_ENDPOINT) || 'submit';
      await submitApi.post(submitEndpoint, submissionData);

      // Store the referral code that was submitted for success message
      setSubmittedReferralCode(referralCode);
      setIsSubmitted(true);
      // Reset scroll flag for new submission
      hasScrolledToSuccess.current = false;

      // Notify parent window of successful submission
      notifyParentSubmitSuccess();

      // Clear persisted form data on successful submission
      clearPersistedFormData();
      hasRestoredPersistedData.current = false;

      // Generate new referral code for next submission
      setReferralCode(generateReferralCode());

      // Reset Turnstile widget (skip in local development)
      if (!isLocalDev) {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
        setTurnstileToken(null);
      } else {
        // Re-set token for local dev
        setTurnstileToken('local-dev-token');
      }

    } catch (error) {
      console.error('Error submitting form:', error);
      setErrors(prev => ({ ...prev, submit: 'Грешка при подаване на формата' }));


      // Reset Turnstile on error (skip in local development)
      if (!isLocalDev) {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
        setTurnstileToken(null);
      } else {
        // Re-set token for local dev
        setTurnstileToken('local-dev-token');
      }
    }
  };

  if (loading) {
    return <div className="loading">Зареждане...</div>;
  }

  // Show success message after submission
  if (true) {
    return (
      <SignUpSuccess
        submittedReferralCode={submittedReferralCode}
        successMessageRef={successMessageRef}
      />
    );
  }

  // Helper for rendering form groups with tooltips
  const renderField = (
    name: keyof FormData,
    label: string,
    type: string = 'text',
    options: { note?: string, required?: boolean, placeholder?: string, items?: any[], keyField?: string, labelField?: string, disabled?: boolean, pattern?: string, maxLength?: number, autoComplete?: string } = {}
  ) => {
    const error = errors[name];
    const isTouched = touched[name];
    const hasError = !!error && isTouched;

    const getValue = () => {
      const val = formData[name];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        if ('code' in val) return (val as any).code;
        if ('id' in val) return (val as any).id.toString();
        if ('name' in val) return (val as any).name; // Fallback for objects like Settlement in abroad case
      }
      return val.toString();
    };

    const commonProps = {
      id: name,
      name: name,
      value: getValue(),
      onChange: handleChange,
      onBlur: () => handleBlur(name),
      className: `${hasError ? 'error' : ''}`,
      required: options.required,
      ...(options.autoComplete !== undefined && { autoComplete: options.autoComplete })
    };

    return (
      <div className={`form-group ${hasError ? 'has-error' : ''}`}>
        <label htmlFor={name}>
          {label} {options.required && <span className="required">*</span>}
        </label>

        <div className="input-wrapper">
          {type === 'select' ? (
            <select {...commonProps} disabled={options.disabled}>
              <option value="">Изберете...</option>
              {(options.items || []).map(item => (
                <option key={item[options.keyField || 'id']} value={item[options.keyField || 'id']}>
                  {item[options.labelField || 'name']}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={type}
              placeholder={options.placeholder}
              pattern={options.pattern}
              maxLength={options.maxLength}
              {...commonProps}
            />
          )}

          {hasError && options.note && (
            <div className="validation-tooltip">{options.note}</div>
          )}
          {hasError && !options.note && (
            <div className="validation-tooltip">{error}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="volunteer-registration-form">
      <form onSubmit={handleSubmit} autoComplete="on">
        <div className="form-section">
          <div className="form-group">
            <label>Роля</label>
            <div style={{ flexDirection: 'row' }} className="radio-group">
              <label
                className="role-disabled"
                title="Вече не приемаме регистрации за тази роля, тъй като не можем да ви регистрираме като застъпник. Можете да помогнете като видеонаблюдател от вкъщи."
              >
                <input
                  type="radio"
                  name="role"
                  value="poll_watcher"
                  checked={false}
                  disabled
                  onChange={handleChange}
                />
                Пазител на вота в секция
              </label>
              <label>
                <input
                  type="radio"
                  name="role"
                  value="video_surveillance"
                  checked={formData.role === 'video_surveillance'}
                  onChange={handleChange}
                />
                Видеонаблюдение от вкъщи
              </label>
            </div>
            <div className="role-notice">
              Вече не приемаме регистрации за „Пазител на вота в секция", тъй като не можем да ви регистрираме като застъпник. Можете да помогнете като видеонаблюдател от вкъщи.
            </div>
          </div>
        </div>

        <div className="form-section">
          {renderField('firstName', 'Име', 'text', {
            required: true,
            note: 'Името трябва да е на кирилица',
            autoComplete: 'given-name'
          })}
          {renderField('middleName', 'Презиме', 'text', {
            required: true,
            note: 'Презимето трябва да е на кирилица',
            autoComplete: 'additional-name'
          })}
          {renderField('lastName', 'Фамилия', 'text', {
            required: true,
            note: 'Фамилията трябва да е на кирилица',
            autoComplete: 'family-name'
          })}
          {renderField('email', 'Имейл', 'email', {
            required: true,
            pattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+',
            autoComplete: 'email'
          })}
          {renderField('phone', 'Телефонен номер', 'tel', {
            required: true,
            placeholder: '08xxxxxxxx / +359xxxxxxxx',
            note: 'Невалиден телефонен номер',
            autoComplete: 'tel'
          })}
          {roleRequires('egn') && renderField('egn', 'ЕГН', 'text', {
            required: true,
            maxLength: 10,
            autoComplete: 'off'
          })}
          {isObserver && formData.role === 'poll_watcher' && (
            <>
              <div className="info-text" style={{ marginBottom: '0.5rem' }}>
                <p>Тези данни са необходими за вашата Декларация като наблюдател</p>
              </div>
              {renderField('idCardNumber', 'Лична карта №', 'text', {
                required: true,
                autoComplete: 'off'
              })}
              {renderField('permanentAddress', 'Постоянен адрес', 'text', {
                required: true,
                autoComplete: 'off'
              })}
            </>
          )}
        </div>

        <div className="form-section">
          {renderField('region', 'Област', 'select', {
            required: true,
            items: displayRegions,
            keyField: 'code',
            autoComplete: 'off'
          })}

          {!isAbroad && renderField('municipality', 'Община', 'select', {
            required: true,
            items: municipalities,
            keyField: 'code',
            disabled: !formData.region,
            autoComplete: 'off'
          })}

          {isAbroad && renderField('country', 'Държава', 'select', {
            required: true,
            items: countries,
            keyField: 'code',
            autoComplete: 'off'
          })}

          <div className={`form-group ${errors.settlement && touched.settlement ? 'has-error' : ''}`}>
            <label htmlFor="settlement">
              Населено място <span className="required">*</span>
            </label>
            <div className="input-wrapper">
              {isAbroad ? (
                <input
                  type="text"
                  id="settlement"
                  name="settlement"
                  value={formData.settlement?.name || ''}
                  onChange={handleChange}
                  onBlur={() => handleBlur('settlement')}
                  className={errors.settlement && touched.settlement ? 'error' : ''}
                  autoComplete="off"
                  required
                />
              ) : (
                <select
                  id="settlement"
                  name="settlement"
                  value={formData.settlement?.id || ''}
                  onChange={handleChange}
                  onBlur={() => handleBlur('settlement')}
                  className={errors.settlement && touched.settlement ? 'error' : ''}
                  disabled={!formData.municipality}
                  autoComplete="off"
                  required
                >
                  <option value="">Изберете...</option>
                  {[...settlements].sort((a, b) => {
                    const isACity = a.name.startsWith('гр.');
                    const isBCity = b.name.startsWith('гр.');
                    if (isACity && !isBCity) return -1;
                    if (!isACity && isBCity) return 1;
                    return a.name.localeCompare(b.name, 'bg');
                  }).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              {errors.settlement && touched.settlement && (
                <div className="validation-tooltip">{errors.settlement}</div>
              )}
            </div>
          </div>


          {formData.settlement?.cityRegions && formData.settlement.cityRegions.length > 0 && !isAbroad && (
            <div className={`form-group ${errors.cityRegion && touched.cityRegion ? 'has-error' : ''}`}>
              <label htmlFor="cityRegion">
                Район <span className="required">*</span>
              </label>
              <div className="input-wrapper">
                <select
                  id="cityRegion"
                  name="cityRegion"
                  value={formData.cityRegion?.name || ''}
                  onChange={handleChange}
                  onBlur={() => handleBlur('cityRegion')}
                  className={errors.cityRegion && touched.cityRegion ? 'error' : ''}
                  autoComplete="off"
                  required
                >
                  <option value="">Изберете...</option>
                  {[...(formData.settlement?.cityRegions || [])].sort((a, b) =>
                    a.name.localeCompare(b.name, 'bg')
                  ).map(s => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
                {errors.cityRegion && touched.cityRegion && (
                  <div className="validation-tooltip">{errors.cityRegion}</div>
                )}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="pollingStation">Адрес на секцията където гласувате</label>
            <div className="input-wrapper">
              {isAbroad ? (
                <input
                  type="text"
                  id="pollingStation"
                  name="pollingStation"
                  value={typeof formData.pollingStation === 'string' ? formData.pollingStation : formData.pollingStation?.place || ''}
                  onChange={handleChange}
                  autoComplete="off"
                />
              ) : (
                <select
                  id="pollingStation"
                  name="pollingStation"
                  value={typeof formData.pollingStation === 'object' ? formData.pollingStation?.id || '' : ''}
                  onChange={handleChange}
                  disabled={!formData.settlement}
                  autoComplete="off"
                >
                  <option value="">Изберете...</option>
                  {[...pollingStations].sort((a, b) => {
                    // Extract leading numbers for numeric comparison
                    const numMatchA = a.place.match(/^\d+/);
                    const numMatchB = b.place.match(/^\d+/);

                    if (numMatchA && numMatchB) {
                      // Both start with numbers - compare numerically
                      const numA = parseInt(numMatchA[0], 10);
                      const numB = parseInt(numMatchB[0], 10);
                      if (numA !== numB) {
                        return numA - numB;
                      }
                      // If numbers are equal, compare the rest alphabetically
                      return a.place.localeCompare(b.place, 'bg');
                    } else if (numMatchA) {
                      // Only A starts with number - numbers come first
                      return -1;
                    } else if (numMatchB) {
                      // Only B starts with number - numbers come first
                      return 1;
                    } else {
                      // Neither starts with number - alphabetical comparison
                      return a.place.localeCompare(b.place, 'bg');
                    }
                  }).map(s => <option key={s.id} value={s.id}>{s.place}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {roleRequires('travelAbility') && <div className="form-section">
          <div className="form-group">
            <label>Възможност да пътувате</label>
            <div className="radio-group">
              {(() => {
                const isAbroad = formData.region?.code === ABROAD_ID;
                const isSofiaGrad = formData.region?.code === 'sofia-merged';
                const travelOptions = isAbroad
                  ? [
                    { val: 'no', lab: 'Само където гласувам' },
                    {
                      val: 'settlement',
                      lab: formData.settlement?.name
                        ? `В рамките на ${formData.settlement.name}`
                        : 'В рамките на града'
                    },
                    {
                      val: 'region',
                      lab: formData.country?.name
                        ? `В рамките на ${formData.country.name}`
                        : 'В рамките на държавата'
                    },
                    { val: 'distant', lab: 'В други държави' }
                  ]
                  : [
                    { val: 'no', lab: 'Само където гласувам' },
                    {
                      val: 'settlement',
                      lab: formData.settlement?.name
                        ? `В рамките на ${formData.settlement.name}`
                        : 'В рамките на населеното място'
                    },
                    {
                      val: 'municipality',
                      lab: formData.municipality?.name
                        ? `В рамките на община ${formData.municipality.name}`
                        : 'В рамките на общината'
                    },
                    ...(isSofiaGrad ? [] : [{
                      val: 'region',
                      lab: formData.region?.name
                        ? (formData.region.name.includes('МИР')
                          ? `В рамките на ${formData.region.name}`
                          : `В рамките на област ${formData.region.name}`)
                        : 'В рамките на областта'
                    }]),
                    { val: 'distant', lab: 'В други области' }
                  ];

                return travelOptions.map((opt, index, arr) => {
                  const hierarchy = isAbroad
                    ? ['no', 'settlement', 'region', 'distant']
                    : (isSofiaGrad
                      ? ['no', 'settlement', 'municipality', 'distant']
                      : ['no', 'settlement', 'municipality', 'region', 'distant']);
                  const currentIndex = hierarchy.indexOf(opt.val);
                  const selectedIndex = hierarchy.indexOf(formData.travelAbility);

                  // Slider behavior: check all options from top (index 0) down to selected level
                  // 'no' is always checked when any level is selected (it's the base level)
                  let isChecked = currentIndex <= selectedIndex;

                  // Special handling for "distant" option - show input inline
                  if (opt.val === 'distant' && !isAbroad) {
                    return (
                      <div key={opt.val} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap', width: '100%' }}>
                        <label style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                          <input
                            type="checkbox"
                            name="travelAbility"
                            value={opt.val}
                            checked={isChecked}
                            onChange={handleChange}
                          />
                          <span>{opt.lab}</span>
                        </label>
                        {formData.travelAbility === 'distant' && (
                          <div style={{ display: 'flex', flex: '1', minWidth: '250px', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              id="distantOblasts"
                              name="distantOblasts"
                              value={formData.distantOblasts || ''}
                              onChange={handleChange}
                              onBlur={() => handleBlur('distantOblasts')}
                              className={errors.distantOblasts && touched.distantOblasts ? 'error' : ''}
                              placeholder="Например: София, Пловдив, Варна"
                              autoComplete="off"
                              required
                              style={{
                                flex: '1',
                                minWidth: '200px',
                                padding: '0.5rem',
                                border: errors.distantOblasts && touched.distantOblasts ? '1px solid #ef4444' : '1px solid #cbd5e1',
                                borderRadius: '4px'
                              }}
                            />
                            <span className="required">*</span>
                          </div>
                        )}
                        {formData.travelAbility === 'distant' && errors.distantOblasts && touched.distantOblasts && (
                          <div className="validation-tooltip" style={{ width: '100%', marginTop: '0.25rem', marginLeft: '0' }}>{errors.distantOblasts}</div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <label key={opt.val}>
                      <input
                        type="checkbox"
                        name="travelAbility"
                        value={opt.val}
                        checked={isChecked}
                        onChange={handleChange}
                      />
                      {opt.lab}
                    </label>
                  );
                });
              })()}
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
              Участие в рискови секции
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="riskySections"
                checked={formData.riskySections}
                onChange={handleChange}
              />
              <span>
                Мога да участвам в рискови секции
              </span>
            </label>
          </div>

          <div className="info-text">
            <p><strong>Важно:</strong> Това е доброволен труд без заплащане</p>
          </div>
        </div>}

        {
          !isLocalDev && turnstileSiteKey && turnstileSiteKey.trim() !== '' && (
            <div className="form-section">
              <div className={`form-group ${errors.turnstile && touched.turnstile ? 'has-error' : ''}`}>
                <div ref={turnstileRef} className="turnstile-widget"></div>
                {errors.turnstile && touched.turnstile && (
                  <span className="error-message">{errors.turnstile}</span>
                )}
              </div>
            </div>
          )
        }

        <div className="form-section">
          <div className={`form-group ${errors.gdprConsent && touched.gdprConsent ? 'has-error' : ''}`}>
            <div className="input-wrapper">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="gdprConsent"
                  checked={formData.gdprConsent}
                  onChange={handleChange}
                  onBlur={() => handleBlur('gdprConsent')}
                />
                <span>
                  Съгласен/на съм с <a href={effectivePrivacyUrl} target="_blank">условията за съхраняване на лични данни</a>
                </span>
                <span className="required">*</span>
              </label>
              {touched.gdprConsent && !formData.gdprConsent && errors.gdprConsent && (
                <div className="validation-tooltip visible">{errors.gdprConsent}</div>
              )}
            </div>
          </div>
        </div>

        {errors.submit && <div className="error-message submit-error">{errors.submit}</div>}

        <button
          type="submit"
          className="submit-button"
          disabled={
            !formData.gdprConsent ||
            (!isLocalDev && turnstileSiteKey && turnstileSiteKey.trim() !== '' && !turnstileToken) ||
            Object.values(errors).some(error => !!error)
          }
        >
          Регистрирай се
        </button>
      </form >
    </div >
  );
};

export default SignUpWidget;
