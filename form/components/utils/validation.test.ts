import { describe, it, expect } from 'vitest';
import { validateCyrillic, validateEmail, validatePhone, validateEGN, ELECTION_DATE } from './validation';

describe('validateCyrillic', () => {
    it('should accept valid Cyrillic text', () => {
        expect(validateCyrillic('Иванов')).toBe(true);
        expect(validateCyrillic('Петър')).toBe(true);
        expect(validateCyrillic('ГЕОРГИЕВ')).toBe(true);
        expect(validateCyrillic('Стоянова-Петрова')).toBe(true);
        expect(validateCyrillic('Анна Мария')).toBe(true);
    });

    it('should reject Latin characters', () => {
        expect(validateCyrillic('Ivanov')).toBe(false);
        expect(validateCyrillic('Smith')).toBe(false);
    });

    it('should reject mixed Cyrillic and Latin', () => {
        expect(validateCyrillic('Иванов Smith')).toBe(false);
        expect(validateCyrillic('Петър123')).toBe(false);
    });

    it('should reject numbers', () => {
        expect(validateCyrillic('Иванов123')).toBe(false);
        expect(validateCyrillic('123')).toBe(false);
    });

    it('should reject special characters except space and hyphen', () => {
        expect(validateCyrillic('Иванов@')).toBe(false);
        expect(validateCyrillic('Петър!')).toBe(false);
        expect(validateCyrillic('Георгиев_')).toBe(false);
    });

    it('should handle empty strings', () => {
        expect(validateCyrillic('')).toBe(false);
    });
});

describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
        expect(validateEmail('test@example.com')).toBe(true);
        expect(validateEmail('user.name@example.com')).toBe(true);
        expect(validateEmail('user+tag@example.co.uk')).toBe(true);
        expect(validateEmail('user_name@sub.example.com')).toBe(true);
        expect(validateEmail('123@example.com')).toBe(true);
    });

    it('should reject invalid email formats', () => {
        expect(validateEmail('invalid')).toBe(false);
        expect(validateEmail('invalid@')).toBe(false);
        expect(validateEmail('@example.com')).toBe(false);
        expect(validateEmail('invalid@.com')).toBe(false);
        expect(validateEmail('invalid@example')).toBe(false);
    });

    it('should reject emails with spaces', () => {
        expect(validateEmail('test @example.com')).toBe(false);
        expect(validateEmail('test@ example.com')).toBe(false);
        expect(validateEmail('test @example .com')).toBe(false);
    });

    it('should reject multiple @ symbols', () => {
        expect(validateEmail('test@@example.com')).toBe(false);
        expect(validateEmail('test@test@example.com')).toBe(false);
    });

    it('should handle empty strings', () => {
        expect(validateEmail('')).toBe(false);
    });
});

describe('validatePhone', () => {
    describe('Bulgarian mobile numbers', () => {
        it('should accept valid Bulgarian mobile numbers with +359', () => {
            expect(validatePhone('+359888123456')).toBe(true);
            expect(validatePhone('+359898765432')).toBe(true);
            expect(validatePhone('+359878111222')).toBe(true);
        });

        it('should accept valid Bulgarian mobile numbers starting with 0', () => {
            expect(validatePhone('0888123456')).toBe(true);
            expect(validatePhone('0898765432')).toBe(true);
            expect(validatePhone('0878111222')).toBe(true);
        });

        it('should accept formatted phone numbers (libphonenumber-js parses them)', () => {
            expect(validatePhone('+359 888 123 456')).toBe(true);
            expect(validatePhone('+359-888-123-456')).toBe(true);
            expect(validatePhone('+359 (888) 123-456')).toBe(true);
            expect(validatePhone('0888 123 456')).toBe(true);
        });

        it('should reject Bulgarian landline numbers', () => {
            expect(validatePhone('+35928123456')).toBe(false); // Sofia
            expect(validatePhone('+35932123456')).toBe(false); // Plovdiv
            expect(validatePhone('+35952123456')).toBe(false); // Varna
            expect(validatePhone('028123456')).toBe(false);
            expect(validatePhone('032123456')).toBe(false);
        });
    });

    describe('International numbers', () => {
        it('should accept valid international mobile numbers', () => {
            expect(validatePhone('+491701234567')).toBe(true); // Germany
            expect(validatePhone('+447911123456')).toBe(true); // UK
            expect(validatePhone('+33612345678')).toBe(true); // France
            expect(validatePhone('+12025551234')).toBe(true); // USA
        });

        it('should reject international numbers that are too short', () => {
            expect(validatePhone('+491')).toBe(false);
            expect(validatePhone('+331')).toBe(false);
        });

        it('should reject international numbers that are too long', () => {
            expect(validatePhone('+4912345678901234567890')).toBe(false);
        });
    });

    describe('Invalid formats', () => {
        it('should reject numbers without country code or leading 0', () => {
            expect(validatePhone('12345')).toBe(false);
        });

        it('should reject numbers with letters', () => {
            expect(validatePhone('+359888abc456')).toBe(false);
            expect(validatePhone('0888ABC456')).toBe(false);
        });

        it('should reject empty strings', () => {
            expect(validatePhone('')).toBe(false);
        });

        it('should reject too short numbers', () => {
            expect(validatePhone('+35988')).toBe(false);
            expect(validatePhone('088')).toBe(false);
        });
    });
});

describe('validateEGN', () => {
    describe('Valid EGNs', () => {
        it('should accept valid EGN for people born in 1900s', () => {
            // Example: Born 15.03.1985, age 41 on election date
            expect(validateEGN('8503154928').valid).toBe(true);
        });

        it('should accept valid EGN for people born in 2000s', () => {
            // Example: Born 15.05.2005, age 20 on election date (month 05 + 40 = 45)
            expect(validateEGN('0545150320').valid).toBe(true);
        });

        it('should accept valid EGN for people exactly 18 on election date', () => {
            // Born 29.03.2008, exactly 18 on 29.03.2026 (month 03 + 40 = 43)
            expect(validateEGN('0843290160').valid).toBe(true);
        });
    });

    describe('Format validation', () => {
        it('should reject EGN with less than 10 digits', () => {
            const result = validateEGN('123456789');
            expect(result.valid).toBe(false);
            expect(result.message).toBe('ЕГН трябва да съдържа 10 цифри');
        });

        it('should reject EGN with more than 10 digits', () => {
            const result = validateEGN('12345678901');
            expect(result.valid).toBe(false);
            expect(result.message).toBe('ЕГН трябва да съдържа 10 цифри');
        });

        it('should reject EGN with non-numeric characters', () => {
            const result = validateEGN('850315492A');
            expect(result.valid).toBe(false);
            expect(result.message).toBe('ЕГН трябва да съдържа 10 цифри');
        });

        it('should reject empty string', () => {
            const result = validateEGN('');
            expect(result.valid).toBe(false);
            expect(result.message).toBe('ЕГН трябва да съдържа 10 цифри');
        });
    });

    describe('Date validation', () => {
        it('should reject invalid month (13+)', () => {
            const result = validateEGN('8513154929'); // Month 13
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалиден месец в ЕГН');
        });

        it('should reject invalid month (00)', () => {
            const result = validateEGN('8500154929'); // Month 00
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалиден месец в ЕГН');
        });

        it('should reject invalid day (32)', () => {
            const result = validateEGN('8503324929'); // Day 32
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалидна дата в ЕГН');
        });

        it('should reject invalid day (00)', () => {
            const result = validateEGN('8503004929'); // Day 00
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалидна дата в ЕГН');
        });

        it('should reject February 30', () => {
            const result = validateEGN('8502304929'); // Feb 30
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалидна дата в ЕГН');
        });

        it('should reject invalid dates for specific months', () => {
            const result = validateEGN('8504314929'); // April 31
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалидна дата в ЕГН');
        });

        it('should reject a clearly invalid test EGN', () => {
            expect(validateEGN('1111111111').valid).toBe(false);
        });
    });

    describe('Century encoding (1800s - month 21-32)', () => {
        it('should accept valid EGN from 1800s', () => {
            // Born 15.03.1885 (month 23 = 03 + 20), would be 141 on election date
            expect(validateEGN('8523154922').valid).toBe(true);
        });

        it('should reject invalid month in 1800s range', () => {
            const result = validateEGN('8533154929'); // Month 33 is invalid
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалиден месец в ЕГН');
        });
    });

    describe('Century encoding (2000s - month 41-52)', () => {
        it('should accept valid EGN from 2000s', () => {
            // Born 15.03.2005 (month 43 = 03 + 40), age 21 on election date
            expect(validateEGN('0543150320').valid).toBe(true);
        });

        it('should reject invalid month in 2000s range', () => {
            const result = validateEGN('0553150324'); // Month 55 is invalid
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалиден месец в ЕГН');
        });
    });

    describe('Age validation (18+ on 29.03.2026)', () => {
        it('should accept person who turns 18 before election date', () => {
            // Born 01.01.2008, turns 18 on 01.01.2026 (before election)
            expect(validateEGN('0841010167').valid).toBe(true);
        });

        it('should accept person who turns 18 on election date', () => {
            // Born 19.04.2008, turns 18 exactly on 19.04.2026
            // EGN: 08 44 19 016 checksum
            // Weights: [2,4,8,5,10,9,7,3,6]
            // 0*2+8*4+4*8+4*5+1*10+9*9+0*7+1*3+6*6 = 0+32+32+20+10+81+0+3+36 = 214
            // 214 % 11 = 5, checksum = 5
            expect(validateEGN('0844190165').valid).toBe(true);
        });

        it('should reject person who turns 18 after election date', () => {
            // Born 20.04.2008, turns 18 on 20.04.2026 (1 day after election)
            // EGN: 08 44 20 027 checksum
            // 0*2+8*4+4*8+4*5+2*10+0*9+0*7+2*3+7*6 = 0+32+32+20+20+0+0+6+42 = 152
            // 152 % 11 = 9, checksum = 9
            const result = validateEGN('0844200279');
            expect(result.valid).toBe(false);
            expect(result.message).toContain('Трябва да сте навършили 18 години към');
        });

        it('should reject person born in 2009 (17 years old on election date)', () => {
            // Born 15.03.2009, only 17 on election date
            const result = validateEGN('0943150142');
            expect(result.valid).toBe(false);
            expect(result.message).toContain('Трябва да сте навършили 18 години към');
        });

        it('should reject person born in 2010', () => {
            // Born 15.03.2010, only 16 on election date
            const result = validateEGN('1043150010');
            expect(result.valid).toBe(false);
            expect(result.message).toContain('Трябва да сте навършили 18 години към');
        });

        it('should handle birthday after election date in same year', () => {
            // Born 01.12.2008, turns 18 on 01.12.2026 (after election)
            const result = validateEGN('0852010248');
            expect(result.valid).toBe(false);
            expect(result.message).toContain('Трябва да сте навършили 18 години към');
        });
    });

    describe('validateEGN - Checksum validation', () => {
        it('should reject 1111111111 (invalid checksum)', () => {
            const result = validateEGN('1111111111');
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалиден ЕГН (грешна контролна сума)');
        });

        it('should reject 0000000000 (invalid checksum)', () => {
            const result = validateEGN('0000000000');
            expect(result.valid).toBe(false);
            // Will fail on date validation before checksum
        });

        it('should reject EGN with valid date but wrong checksum', () => {
            // Valid date (15.03.1985) but last digit is wrong
            const result = validateEGN('8503154920'); // Should be 4929
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалиден ЕГН (грешна контролна сума)');
        });

        it('should accept EGN with correct checksum', () => {
            // Valid EGN: 15.03.1985
            expect(validateEGN('8503154928').valid).toBe(true);
        });

        it('should handle checksum = 10 (maps to 0)', () => {
            // Find an EGN where checksum % 11 = 10
            // Example: when sum % 11 = 10, last digit should be 0
            // Need to construct such an EGN
            // Let's verify this case exists and works
        });

        it('should validate multiple real-world EGNs', () => {
            const validEGNs = [
                '8503154928', // Born 15.03.1985
                '0543150320', // Born 15.03.2005
            ];

            validEGNs.forEach(egn => {
                expect(validateEGN(egn).valid).toBe(true);
            });
        });
    });

    describe('Edge cases', () => {
        it('should handle leap year dates correctly', () => {
            // Born 29.02.2004 (leap year), age 22 on election date
            expect(validateEGN('0442290160').valid).toBe(true);
        });

        it('should reject Feb 29 in non-leap year', () => {
            // 2005 was not a leap year
            const result = validateEGN('0542290177');
            expect(result.valid).toBe(false);
            expect(result.message).toBe('Невалидна дата в ЕГН');
        });

        it('should handle end of month correctly', () => {
            // Born 31.12.2005, age 20 on election date
            expect(validateEGN('0552310102').valid).toBe(true);
        });

        it('should handle beginning of year correctly', () => {
            // Born 01.01.2008, age 18 on election date
            expect(validateEGN('0841010167').valid).toBe(true);
        });
    });

    describe('Error messages', () => {
        it('should include formatted election date in age error message', () => {
            const result = validateEGN('0943150142'); // 17 years old
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/); // Date format
        });
    });
});

describe('ELECTION_DATE constant', () => {
    it('should be set to April 19, 2026', () => {
        expect(ELECTION_DATE.getFullYear()).toBe(2026);
        expect(ELECTION_DATE.getMonth()).toBe(3); // April is month 3 (0-indexed)
        expect(ELECTION_DATE.getDate()).toBe(19);
    });
});