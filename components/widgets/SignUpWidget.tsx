import React, { useState, useEffect, ChangeEvent, FormEvent, useRef } from 'react';
import api from '../utils/api';
import { validateCyrillic, validatePhone, validateEGN, validateEmail } from '../utils/validation';

import '../style/SignUpWidget.css';

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
    travelAbility: 'no' | 'settlement' | 'municipality' | 'region' | 'risky_distant';
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

const SignUpWidget: React.FC<SignUpWidgetProps> = ({ privacyUrl = '/privacy' }) => {
    const ABROAD_ID = '32'; // ID за "Извън страната"
    const BULGARIA_ID = '000'; // ID за "България"
    const TURNSTILE_SITE_KEY = process.env.VITE_TURNSTILE_SITE_KEY || 'TURNSTILE_SITE_KEY';

    // Add turnstile refs
    const turnstileRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

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
        gdprConsent: false,
        role: 'poll_watcher'
    });

    // API data state
    const [regions, setRegions] = useState<Region[]>([]);
    const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [pollingStations, setPollingStations] = useState<PollingStation[]>([]);
    const [countries, setCountries] = useState<Country[]>([]);

    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

    const isAbroad = formData.region?.code === ABROAD_ID;

    // Tracking states
    const [errors, setErrors] = useState<FormErrors>({});
    const [touched, setTouched] = useState<TouchedFields>({});
    const [loading, setLoading] = useState<boolean>(true);

    // Load Turnstile script
    useEffect(() => {
        // Check if script already exists
        if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);

        return () => {
            // Cleanup on unmount
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };
    }, []);

    // Initialize Turnstile widget
    useEffect(() => {
        if (!turnstileRef.current) return;

        const renderTurnstile = () => {
            if (window.turnstile && !widgetIdRef.current) {
                try {
                    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
                        sitekey: TURNSTILE_SITE_KEY,
                        callback: (token: string) => {
                            setTurnstileToken(token);
                            setErrors(prev => {
                                const { turnstile, ...rest } = prev;
                                return rest;
                            });
                        },
                        'error-callback': () => {
                            setTurnstileToken(null);
                            setErrors(prev => ({
                                ...prev,
                                turnstile: 'Грешка при валидацията. Моля опитайте отново.'
                            }));
                        },
                        'expired-callback': () => {
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
                } catch (error) {
                    console.error('Error rendering Turnstile:', error);
                }
            }
        };

        // Wait for Turnstile script to load
        if (window.turnstile) {
            renderTurnstile();
        } else {
            const checkTurnstile = setInterval(() => {
                if (window.turnstile) {
                    renderTurnstile();
                    clearInterval(checkTurnstile);
                }
            }, 100);

            return () => clearInterval(checkTurnstile);
        }
    }, [TURNSTILE_SITE_KEY]);

    // Fetch initial data
    useEffect(() => {
        fetchRegions();
        fetchCountries();
    }, []);

    // Real-time validation with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            validateForm(false); // Validate without setting all as touched
        }, 500);

        return () => clearTimeout(timer);
    }, [formData]);

    // Fetch regions from API
    const fetchRegions = async () => {
        try {
            setLoading(true);
            const data = await api.get<never, Region[]>('election_regions');
            setRegions(data);
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
        const countriesList: Country[] = await api.get<never, Country[]>('countries');
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
        if (formData.municipality && formData.region && formData.region.code !== ABROAD_ID) {
            fetchSettlements(formData.municipality.code);
        } else if (formData.region?.code !== ABROAD_ID) {
            setSettlements([]);
        }
    }, [formData.municipality]);

    const fetchSettlements = async (municipalityId: string) => {
        try {
            const data = await api.get<never, Settlement[]>(`towns?country=${BULGARIA_ID}&election_region=${formData.region?.code}&municipality=${municipalityId}`);
            setSettlements(data);

            if (data.length === 1) {
                const settlement = data[0];
                const cityRegion = settlement.cityRegions.length === 1 ? settlement.cityRegions[0] : null;
                setFormData(prev => ({
                    ...prev,
                    settlement,
                    cityRegion
                }));
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

    const fetchPollingStations = async (settlementId: string) => {
        try {
            const data = await api.get<never, PollingStation[]>(`sections?town=${settlementId}${formData.cityRegion ? `&city_region=${formData.cityRegion.code}` : ''}`);

            // Filter duplicates by place (normalized)
            const uniqueData = data.filter((station, index, self) => {
                const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
                return index === self.findIndex((s) => normalize(s.place) === normalize(station.place));
            });

            setPollingStations(uniqueData);

            if (uniqueData.length === 1) {
                setFormData(prev => ({ ...prev, pollingStation: uniqueData[0] }));
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


        if (formData.middleName.trim() && !validateCyrillic(formData.middleName)) {
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
            newErrors.phone = 'Невалиден мобилен номер';
        }

        const egnVal = validateEGN(formData.egn);
        if (!egnVal.valid) {
            newErrors.egn = egnVal.message || 'Невалиден ЕГН';
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

        // Turnstile validation
        if (!turnstileToken) {
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
            const hierarchy = ['no', 'settlement', 'municipality', 'region', 'risky_distant'];
            const targetLevel = value;

            if (targetLevel === 'no') {
                setFormData(prev => ({ ...prev, travelAbility: 'no' }));
            } else if (targetLevel === formData.travelAbility) {
                // If clicking the current highest level, move one step down
                const currentIndex = hierarchy.indexOf(targetLevel);
                const prevLevel = hierarchy[currentIndex - 1] || 'no';
                setFormData(prev => ({ ...prev, travelAbility: prevLevel as any }));
            } else {
                setFormData(prev => ({ ...prev, travelAbility: targetLevel as any }));
            }
            return;
        }

        if (name === 'phone') {
            finalValue = value.replace(/[^\d+]/g, '');
        }

        if (name === 'egn') {
            finalValue = value.replace(/[^\d]/g, '');
        }

        if (name === 'region') {
            const region = regions.find(r => r.code === value) || null;
            setFormData(prev => ({
                ...prev,
                region,
                municipality: null,
                settlement: null,
                pollingStation: null
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
                pollingStation: null
            }));
            setTouched(prev => ({
                ...prev,
                settlement: false,
                cityRegion: false,
                pollingStation: false
            }));
        } else if (name === 'country') {
            const country = countries.find(c => c.code === value) || null;
            setFormData(prev => ({ ...prev, country }));
        } else if (name === 'settlement') {
            if (isAbroad) {
                setFormData(prev => ({
                    ...prev,
                    settlement: { id: 0, name: value, cityRegions: [] },
                    pollingStation: null
                }));
            } else {
                const settlement = settlements.find(s => s.id.toString() === value) || null;
                const cityRegion = settlement && settlement.cityRegions.length === 1 ? settlement.cityRegions[0] : null;
                setFormData(prev => ({
                    ...prev,
                    settlement,
                    cityRegion,
                    pollingStation: null
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
                pollingStation: null
            }));
        } else if (!isAbroad && name === 'pollingStation') {
            const pollingStation = pollingStations.find(ps => ps.id.toString() === value) || null;
            setFormData(prev => ({ ...prev, pollingStation }));
        } else {
            setFormData(prev => ({ ...prev, [name]: finalValue }));
        }

        // Clear error immediately when user starts typing to avoid "flashing" or stale errors
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleBlur = (name: string) => {
        setTouched(prev => ({ ...prev, [name]: true }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!validateForm(true)) {
            return;
        }

        try {
            await api.post('volunteers', formData);
            alert('Успешна регистрация!');

            // Reset Turnstile widget
            if (window.turnstile && widgetIdRef.current) {
                window.turnstile.reset(widgetIdRef.current);
            }
            setTurnstileToken(null);

        } catch (error) {
            console.error('Error submitting form:', error);
            setErrors(prev => ({ ...prev, submit: 'Грешка при подаване на формата' }));


            // Reset Turnstile on error
            if (window.turnstile && widgetIdRef.current) {
                window.turnstile.reset(widgetIdRef.current);
            }
            setTurnstileToken(null);
        }
    };

    if (loading) {
        return <div className="loading">Зареждане...</div>;
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
            autoComplete: options.autoComplete
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
            <form onSubmit={handleSubmit}>
                <div className="form-section">
                    <h3>Лична информация</h3>

                    {renderField('firstName', 'Име', 'text', {
                        required: true,
                        note: 'Името трябва да е на кирилица',
                        autoComplete: 'given-name'
                    })}
                    {renderField('middleName', 'Презиме', 'text', {
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
                    {renderField('phone', 'Телефон', 'tel', {
                        required: true,
                        placeholder: '+359xxxxxxxx или 08xxxxxxxx/098xxxxxxxx',
                        note: 'Мобилен телефон, не стационарен',
                        autoComplete: 'tel'
                    })}
                    {renderField('egn', 'ЕГН', 'text', {
                        required: true,
                        maxLength: 10
                    })}
                </div>

                <div className="form-section">
                    <h3>Местоположение</h3>

                    {renderField('region', 'Област', 'select', {
                        required: true,
                        items: regions,
                        keyField: 'code'
                    })}

                    {!isAbroad && renderField('municipality', 'Община / Район', 'select', {
                        required: true,
                        items: municipalities,
                        keyField: 'code',
                        disabled: !formData.region
                    })}

                    {isAbroad && renderField('country', 'Държава', 'select', {
                        required: true,
                        items: countries,
                        keyField: 'code'
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
                                />
                            ) : (
                                <select
                                    id="pollingStation"
                                    name="pollingStation"
                                    value={typeof formData.pollingStation === 'object' ? formData.pollingStation?.id || '' : ''}
                                    onChange={handleChange}
                                    disabled={!formData.settlement}
                                >
                                    <option value="">Изберете...</option>
                                    {pollingStations.map(s => <option key={s.id} value={s.id}>{s.place}</option>)}
                                </select>
                            )}
                        </div>
                    </div>
                </div>

                <div className="form-section">
                    <h3>Възможности</h3>

                    <div className="form-group">
                        <label>Възможност да пътувате</label>
                        <div className="radio-group">
                            {[
                                { val: 'no', lab: 'Не' },
                                { val: 'settlement', lab: `В рамките на населено място ${formData.settlement?.name ?? ''}` },
                                { val: 'municipality', lab: `В рамките на община/район ${formData.municipality?.name ?? ''}` },
                                { val: 'region', lab: `В рамките на обалста ${formData.region?.name ?? ''}` },
                                { val: 'risky_distant', lab: 'Рискови секции на далечно разстояние' }
                            ].map((opt, index, arr) => {
                                const hierarchy = ['no', 'settlement', 'municipality', 'region', 'risky_distant'];
                                const currentIndex = hierarchy.indexOf(opt.val);
                                const selectedIndex = hierarchy.indexOf(formData.travelAbility);

                                let isChecked = false;
                                if (opt.val === 'no') {
                                    isChecked = formData.travelAbility === 'no';
                                } else if (formData.travelAbility !== 'no') {
                                    isChecked = currentIndex <= selectedIndex;
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
                            })}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Роля</label>
                        <div className="radio-group">
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

                    <div className="info-text">
                        <p><strong>Важно:</strong> Това е доброволен труд без заплащане</p>
                    </div>
                </div>

                <div className="form-section">
                    <div className={`form-group ${errors.turnstile && touched.turnstile ? 'has-error' : ''}`}>
                        <div ref={turnstileRef} className="turnstile-widget"></div>
                        {errors.turnstile && touched.turnstile && (
                            <span className="error-message">{errors.turnstile}</span>
                        )}
                    </div>
                </div>

                <div className="form-section">
                    <div className={`form-group ${errors.gdprConsent && touched.gdprConsent ? 'has-error' : ''}`}>
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                name="gdprConsent"
                                checked={formData.gdprConsent}
                                onChange={handleChange}
                                onBlur={() => handleBlur('gdprConsent')}
                            />
                            <span>
                                Съгласен/на съм с <a href={privacyUrl} target="_blank">условията за съхраняване на лични данни</a> <span className="required">*</span>
                            </span>
                        </label>
                        {errors.gdprConsent && touched.gdprConsent && (
                            <span className="error-message">{errors.gdprConsent}</span>
                        )}
                    </div>
                </div>

                {errors.submit && <div className="error-message submit-error">{errors.submit}</div>}

                <button type="submit" className="submit-button" disabled={!formData.gdprConsent || !turnstileToken || Object.keys(errors).length > 0}>
                    Регистрирай се
                </button>
            </form>
        </div>
    );
};

export default SignUpWidget;