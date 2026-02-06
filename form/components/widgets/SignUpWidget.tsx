import React, { useState, useEffect, ChangeEvent, FormEvent, useRef } from 'react';
import { dataApi, submitApi } from '../utils/api';
import { validateCyrillic, validatePhone, validateEGN, validateEmail } from '../utils/validation';
import { generateReferralCode, getReferralFromUrl } from '../utils/referral';

import '../style/SignUpWidget.css';

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

const SignUpWidget: React.FC<SignUpWidgetProps> = ({ privacyUrl }) => {
  useIframeHeight();
  // Get privacy URL from env var or prop, default to https://tibroish.bg/privacy-notice
  const effectivePrivacyUrl = privacyUrl ||
    (typeof process !== 'undefined' && process.env?.VITE_PRIVACY_URL) ||
    'https://tibroish.bg/privacy-notice';
  const ABROAD_ID = '32'; // ID за "Извън страната"
  const BULGARIA_ID = '000'; // ID за "България"
  const STORAGE_KEY = 'signup-form-draft';

  // Sofia MIR region codes (stable identifiers)
  const SOFIA_MIR_CODES = ['23', '24', '25'];
  const isSofiaMirRegion = (region: Region) => SOFIA_MIR_CODES.includes(region.code);

  // Disable Turnstile in local development
  const isLocalDev = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
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
    role: 'poll_watcher'
  });

  // API data state
  const [regions, setRegions] = useState<Region[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [pollingStations, setPollingStations] = useState<PollingStation[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);

  // Sofia MIR merge state
  const [sofiaMunicipalityToRegion, setSofiaMunicipalityToRegion] = useState<Map<string, Region>>(new Map());
  const [mergedSofiaRegion, setMergedSofiaRegion] = useState<Region | null>(null);
  const [displayRegions, setDisplayRegions] = useState<Region[]>([]);
  const [actualRegionForApi, setActualRegionForApi] = useState<Region | null>(null);

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string>('');
  const [submittedReferralCode, setSubmittedReferralCode] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

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
      const hasData = data.firstName || data.lastName || data.email || data.phone || data.egn;
      if (hasData) {
        // Save actual MIR region instead of merged Sofia for proper restoration
        const dataToSave = data.region?.code === 'sofia-merged' && actualRegionForApi
          ? { ...data, region: actualRegionForApi }
          : data;
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

        setFormData(prev => ({ ...prev, ...restoredData }));

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
        const seenMunicipalityCodes = new Set<string>();
        const uniqueSofiaMunicipalities: Municipality[] = [];
        const municipalityToRegionMap = new Map<string, Region>();

        for (const region of sofiaRegions) {
          if (region.municipalities) {
            for (const muni of region.municipalities) {
              // Map every municipality code to its first MIR region (for API calls)
              if (!municipalityToRegionMap.has(muni.code)) {
                municipalityToRegionMap.set(muni.code, region);
              }
              // Deduplicate municipalities (all 3 MIRs share "Столична")
              if (!seenMunicipalityCodes.has(muni.code)) {
                seenMunicipalityCodes.add(muni.code);
                uniqueSofiaMunicipalities.push(muni);
              }
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
        setSofiaMunicipalityToRegion(municipalityToRegionMap);
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
      // Check if we have persisted settlement data to restore
      const persistedData = loadPersistedFormData();
      const persistedSettlementId = persistedData?.settlement && typeof persistedData.settlement === 'object'
        ? persistedData.settlement.id
        : undefined;

      fetchSettlements(formData.municipality.code, persistedSettlementId);
    } else if (formData.region?.code !== ABROAD_ID) {
      setSettlements([]);
    }
  }, [formData.municipality]);

  const fetchSettlements = async (municipalityId: string, persistedSettlementId?: number, regionCode?: string) => {
    try {
      const regionId = regionCode || actualRegionForApi?.code || formData.region?.code;
      const data = await dataApi.get<never, Settlement[]>(`towns?country=${BULGARIA_ID}&election_region=${regionId}&municipality=${municipalityId}`);
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
        // Auto-select if there's exactly one city among multiple settlements
        const cities = data.filter(s => s.name.startsWith('гр.'));
        if (cities.length === 1) {
          const settlement = cities[0];
          const cityRegion = settlement.cityRegions.length === 1 ? settlement.cityRegions[0] : null;
          setFormData(prev => ({
            ...prev,
            settlement,
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
    // 1. Role is 'poll_watcher' (required), OR
    // 2. User provided an EGN value (optional validation for video_surveillance)
    if (formData.role === 'poll_watcher' || formData.egn.trim()) {
      const egnVal = validateEGN(formData.egn);
      if (!egnVal.valid) {
        newErrors.egn = egnVal.message || 'Невалиден ЕГН';
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
    if (formData.travelAbility === 'distant' && !isAbroad && !formData.distantOblasts?.trim()) {
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
      const isSofia = formData.region?.name?.includes('София') || formData.region?.name?.includes('Sofia');
      const hierarchy = isAbroad
        ? ['no', 'settlement', 'region', 'distant']
        : (isSofia
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
      // Resolve actual MIR region for Sofia municipalities
      if (municipality && sofiaMunicipalityToRegion.has(municipality.code)) {
        setActualRegionForApi(sofiaMunicipalityToRegion.get(municipality.code) || null);
      }
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
        travelAbility: travelAbilityString,
        distantOblasts: formData.distantOblasts?.trim() || null,
        riskySections: formData.riskySections,
        gdprConsent: formData.gdprConsent,
        role: roleString,
        turnstileToken: isLocalDev ? 'local-dev-token' : turnstileToken,
        referralCode: referralCode,
        referredBy: referredBy || null
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
  if (isSubmitted && submittedReferralCode) {
    const formUrl = (typeof process !== 'undefined' && process.env?.VITE_FORM_URL) || 'https://tibroish.bg/signup';
    const shareUrl = `${formUrl}?ref=${submittedReferralCode}`;
    const shareText = 'Аз се записах за пазител на вота! Запиши се и ти!';

    return (
      <div className="volunteer-registration-form">
        <div ref={successMessageRef} className="success-message" style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f0fdfa',
          borderRadius: '8px',
          border: '2px solid #14b8a6'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', color: '#14b8a6' }}>✓</div>
          <h2 style={{ color: '#0d9488', marginBottom: '1rem' }}>Успешна регистрация!</h2>
          <p style={{ marginBottom: '1.5rem', fontSize: '1.1rem', color: '#334155' }}>
            Благодарим ви за регистрацията!
            <br />
            Ще се свържем с вас по телефона до няколко дни за следващите стъпки.
          </p>
          <div style={{
            backgroundColor: 'white',
            padding: '1rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            marginBottom: '1rem'
          }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>
              Сподели с други, които да се запишат:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={shareUrl}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  backgroundColor: '#f8fafc'
                }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  } catch (e) {
                    // Fallback for older browsers
                    const input = document.createElement('input');
                    input.value = shareUrl;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  }
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: copySuccess ? '#10b981' : '#14b8a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                  minWidth: '100px'
                }}
                onMouseEnter={(e) => {
                  if (!copySuccess) {
                    e.currentTarget.style.backgroundColor = '#0d9488';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!copySuccess) {
                    e.currentTarget.style.backgroundColor = '#14b8a6';
                  }
                }}
              >
                {copySuccess ? 'Копирано!' : 'Копирай'}
              </button>
            </div>
            {copySuccess && (
              <div style={{
                marginTop: '0.5rem',
                fontSize: '0.85rem',
                color: '#10b981',
                textAlign: 'center'
              }}>
                ✓ Копирано
              </div>
            )}
          </div>
          <div style={{
            marginTop: '1rem',
            display: 'flex',
            justifyContent: 'center',
            gap: '0.75rem',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '0.9rem', color: '#475569', marginRight: '0.25rem' }}>Сподели:</span>
            {/* Facebook */}
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
              onClick={(e) => {
                // Copy text to clipboard before opening Facebook
                const textToShare = `${shareText} ${shareUrl}`;
                const copyToClipboard = () => {
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    return navigator.clipboard.writeText(textToShare);
                  } else {
                    // Fallback for older browsers
                    const textarea = document.createElement('textarea');
                    textarea.value = textToShare;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    return Promise.resolve();
                  }
                };

                copyToClipboard().catch(() => {
                  // If clipboard fails, continue anyway
                });
              }}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#1877f2',
                color: 'white',
                textDecoration: 'none',
                transition: 'transform 0.2s, background-color 0.2s',
                fontSize: '20px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.backgroundColor = '#166fe5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = '#1877f2';
              }}
              aria-label="Сподели във Facebook"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            {/* Viber */}
            <a
              href={`viber://forward?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`}
              onClick={(e) => {
                // Fallback to web if app not available
                setTimeout(() => {
                  window.open(`https://vb.me/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank');
                }, 500);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#7360f2',
                color: 'white',
                textDecoration: 'none',
                transition: 'transform 0.2s, background-color 0.2s',
                fontSize: '20px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.backgroundColor = '#5a4bc7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = '#7360f2';
              }}
              aria-label="Сподели във Viber"
            >
              <svg width="20" height="20" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill="none" stroke="white" strokeLinecap="round" strokeWidth="10" d="M269 186a30 30 0 0 1 31 31m-38-58a64 64 0 0 1 64 67m-73-93a97 97 0 0 1 99 104" />
                <path fillRule="evenodd" fill="white" d="M95 232c0-91 17-147 161-147s161 56 161 147-17 147-161 147l-26-1-53 63c-4 4-8 1-8-3v-69c-6 0-31-12-38-19-22-23-36-40-36-118zm-30 0c0-126 55-177 191-177s191 51 191 177-55 177-191 177c-10 0-18 0-32-2l-38 43c-7 8-28 11-28-13v-42c-6 0-20-6-39-18-19-13-54-44-54-145zm223 42q10-13 24-4l36 27q8 10-7 28t-28 15q-53-12-102-60t-61-104q0-20 25-34 13-9 22 5l25 35q6 12-7 22c-39 15 51 112 73 70z" />
              </svg>
            </a>
            {/* Instagram */}
            <a
              href="https://www.instagram.com/"
              onClick={(e) => {
                e.preventDefault();
                const textToShare = `${shareText} ${shareUrl}`;
                const copyToClipboard = () => {
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    return navigator.clipboard.writeText(textToShare);
                  } else {
                    // Fallback for older browsers
                    const textarea = document.createElement('textarea');
                    textarea.value = textToShare;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    return Promise.resolve();
                  }
                };

                copyToClipboard().then(() => {
                  // Try to open Instagram app first, then fallback to website
                  window.location.href = 'instagram://';
                  setTimeout(() => {
                    window.open('https://www.instagram.com/', '_blank');
                  }, 500);
                }).catch(() => {
                  // If clipboard fails, still try to open Instagram
                  window.location.href = 'instagram://';
                  setTimeout(() => {
                    window.open('https://www.instagram.com/', '_blank');
                  }, 500);
                });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                color: 'white',
                textDecoration: 'none',
                transition: 'transform 0.2s, opacity 0.2s',
                fontSize: '20px',
                border: 'none',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.opacity = '1';
              }}
              aria-label="Сподели в Instagram"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.366.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.366.058-1.645.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.366-.07-1.645-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.366-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            {/* Threads */}
            <a
              href={`https://www.threads.net/intent/post?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#000000',
                color: 'white',
                textDecoration: 'none',
                transition: 'transform 0.2s, background-color 0.2s',
                fontSize: '20px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.backgroundColor = '#333333';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = '#000000';
              }}
              aria-label="Сподели в Threads"
            >
              <svg width="20" height="20" viewBox="0 0 192 192" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
              </svg>
            </a>
            {/* X (Twitter) */}
            <a
              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#000000',
                color: 'white',
                textDecoration: 'none',
                transition: 'transform 0.2s, background-color 0.2s',
                fontSize: '20px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.backgroundColor = '#333333';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = '#000000';
              }}
              aria-label="Сподели в X (Twitter)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            {/* WhatsApp */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#25d366',
                color: 'white',
                textDecoration: 'none',
                transition: 'transform 0.2s, background-color 0.2s',
                fontSize: '20px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.backgroundColor = '#20ba5a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = '#25d366';
              }}
              aria-label="Сподели в WhatsApp"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
            </a>
            {/* LinkedIn */}
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#0077b5',
                color: 'white',
                textDecoration: 'none',
                transition: 'transform 0.2s, background-color 0.2s',
                fontSize: '20px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.backgroundColor = '#005885';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = '#0077b5';
              }}
              aria-label="Сподели в LinkedIn"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
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
              <label>
                <input
                  type="radio"
                  name="role"
                  value="poll_watcher"
                  checked={formData.role === 'poll_watcher'}
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
          {formData.role === 'poll_watcher' && renderField('egn', 'ЕГН', 'text', {
            required: true,
            maxLength: 10,
            autoComplete: 'off'
          })}
        </div>

        <div className="form-section">
          {renderField('region', 'Област', 'select', {
            required: true,
            items: displayRegions,
            keyField: 'code',
            autoComplete: 'off'
          })}

          {!isAbroad && renderField('municipality', 'Община / Район', 'select', {
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
                  {settlements.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                  {formData.settlement?.cityRegions.map(s => (
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

        <div className="form-section">
          <div className="form-group">
            <label>Възможност да пътувате</label>
            <div className="radio-group">
              {(() => {
                const isAbroad = formData.region?.code === ABROAD_ID;
                const isSofia = formData.region?.name?.includes('София') || formData.region?.name?.includes('Sofia');
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
                    ...(isSofia ? [] : [{
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
                    : (isSofia
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
        </div>

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
            // Only check errors for fields that have been touched/blurred
            Object.keys(errors).some(key => {
              const fieldKey = key as keyof TouchedFields;
              return touched[fieldKey] && errors[key];
            })
          }
        >
          Регистрирай се
        </button>
      </form >
    </div >
  );
};

export default SignUpWidget;
