import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';

// Get data API URL from environment variable, default to api.tibroish.bg
const DATA_URL = (typeof process !== 'undefined' && process.env?.VITE_DATA_URL) || 
                 'https://api.tibroish.bg';

// Get submission URL from environment variable, default to submit worker endpoint
const SUBMIT_URL = (typeof process !== 'undefined' && process.env?.VITE_SUBMIT_URL) || 
                   'https://submit.signup.example.com';

// Create axios instance factory
const createApiInstance = (baseURL: string): AxiosInstance => {
    const instance = axios.create({
        baseURL: `${baseURL.replace(/\/+$/, '')}/`,
        headers: {
            'Accept-Language': 'bg-BG',
            'Content-Type': 'application/json',
        },
    });

    instance.interceptors.response.use(
        (res: AxiosResponse) => (res.data !== undefined ? res.data : res),
        (error: AxiosError) => {
            console.error('API error: ', error);
            if (
                error?.response?.data &&
                typeof error.response.data === 'object' &&
                'message' in error.response.data &&
                Array.isArray((error.response.data as any).message)
            ) {
                (error.response.data as any).message = (error.response.data as any).message.join(' ');
            }
            return Promise.reject(error);
        }
    );

    return instance;
};

// Data API instance (for fetching regions, countries, settlements, etc.)
export const dataApi = createApiInstance(DATA_URL);

// Submit API instance (for form submissions)
export const submitApi = createApiInstance(SUBMIT_URL);

// Default export for backward compatibility (uses data API)
const api = dataApi;
export default api;
