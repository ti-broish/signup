// Get election date from environment variable
// Available via process.env (Node.js compat in worker, injected in browser)
const electionDateStr = (typeof process !== 'undefined' && process.env?.VITE_ELECTION_DATE) || '2026-04-19';
export const ELECTION_DATE = new Date(electionDateStr);

import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

export const validateCyrillic = (text: string) => /^[А-Яа-я\s-]+$/.test(text);

export const validateEmail = (email: string) => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
};

export const validatePhone = (phone: string) => {
    if (!phone || phone.trim() === '') {
        return false;
    }

    try {
        // Try to parse the phone number with any country code
        const phoneNumber = parsePhoneNumber(phone);
        
        // Check if it's a valid phone number
        if (!phoneNumber || !isValidPhoneNumber(phoneNumber.number)) {
            return false;
        }

        // Ensure it's a mobile number (not a landline)
        // For Bulgaria, mobile numbers start with 8 or 9
        const countryCode = phoneNumber.country;
        const nationalNumber = phoneNumber.nationalNumber;
        
        if (countryCode === 'BG') {
            // Bulgarian mobile numbers start with 8 or 9
            const firstDigit = nationalNumber.charAt(0);
            if (firstDigit !== '8' && firstDigit !== '9') {
                return false;
            }
        }
        // For other countries, libphonenumber-js validates the number format
        // We accept any valid mobile number from any country

        return true;
    } catch (error) {
        // If parsing fails, try parsing with a default country (Bulgaria)
        try {
            const phoneNumber = parsePhoneNumber(phone, 'BG');
            if (phoneNumber && isValidPhoneNumber(phoneNumber.number)) {
                // Check if it's a Bulgarian mobile number
                const nationalNumber = phoneNumber.nationalNumber;
                const firstDigit = nationalNumber.charAt(0);
                if (firstDigit === '8' || firstDigit === '9') {
                    return true;
                }
            }
        } catch (fallbackError) {
            // If both attempts fail, it's not a valid phone number
        }
        return false;
    }
};

export const validateEGN = (egn: string) => {
    if (egn.length !== 10 || !/^\d{10}$/.test(egn)) {
        return { valid: false, message: 'ЕГН трябва да съдържа 10 цифри' };
    }

    let year = parseInt(egn.substring(0, 2));
    let month = parseInt(egn.substring(2, 4));
    let day = parseInt(egn.substring(4, 6));

    // Century decoding rules:
    // 01-12: 1900-1999
    // 21-32: 1800-1899 (Month - 20)
    // 41-52: 2000-2099 (Month - 40)
    if (month >= 1 && month <= 12) {
        year += 1900;
    } else if (month >= 21 && month <= 32) {
        year += 1800;
        month -= 20;
    } else if (month >= 41 && month <= 52) {
        year += 2000;
        month -= 40;
    } else {
        return { valid: false, message: 'Невалиден месец в ЕГН' };
    }

    const birthDate = new Date(year, month - 1, day);
    if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) {
        return { valid: false, message: 'Невалидна дата в ЕГН' };
    }

    // Check age (must be 18+ on election date)
    const ageOnElectionDate = ELECTION_DATE.getFullYear() - birthDate.getFullYear();
    const monthDiff = ELECTION_DATE.getMonth() - birthDate.getMonth();
    const dayDiff = ELECTION_DATE.getDate() - birthDate.getDate();

    const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)
        ? ageOnElectionDate - 1
        : ageOnElectionDate;

    if (actualAge < 18) {
        const formattedDate = ELECTION_DATE.toLocaleDateString('bg-BG');
        return { valid: false, message: `Трябва да сте навършили 18 години към ${formattedDate}` };
    }

    // Checksum validation
    const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(egn[i]) * weights[i];
    }
    const checksum = sum % 11;
    const expectedChecksum = checksum === 10 ? 0 : checksum;

    if (parseInt(egn[9]) !== expectedChecksum) {
        return { valid: false, message: 'Невалиден ЕГН (грешна контролна сума)' };
    }

    return { valid: true };
};
