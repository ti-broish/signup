import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';

const DATA_URL = process.env.DATA_URL || 'https://api.tibroish.bg';

const api: AxiosInstance = axios.create({
    baseURL: `${DATA_URL.replace(/\/+$/, '')}/`,
    headers: {
        'Accept-Language': 'bg-BG',
        'Content-Type': 'application/json',
    },
});

api.interceptors.response.use(
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

export default api;
