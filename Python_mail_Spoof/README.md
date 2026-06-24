# Email Spoofer 2026 - Python Module

Enhanced email spoofing module with 2026 features, integrated with Node.js email dispatcher.

## Features

- ✅ **Advanced Header Manipulation**: Custom From, Return-Path, Sender headers
- ✅ **Placeholder Support**: Compatible with Node.js placeholder system (##victimdomain##, ##victimemail##, etc.)
- ✅ **Batch Processing**: Send to multiple recipients with rate limiting
- ✅ **Attachment Support**: PDF, DOCX, EML attachments
- ✅ **CID Images**: Inline image support
- ✅ **Standalone Mode**: Can run independently or be called from Node.js
- ✅ **2026 Standards**: Enhanced error handling, SSL/TLS support, timeout handling

## Requirements

- Python 3.7 or higher
- No external dependencies (uses Python standard library only)

## Usage

### Integration with Node.js

1. Enable spoofing in `config.js`:
```javascript
spoofing: {
    enabled: true,
    usePythonSpoofer: true,
    fromEmail: "noreply@##victimdomain##",
    fromName: "Security Team - ##victimdomain##",
    subject: "",
    priority: "1"
}
```

2. Run Node.js as usual:
```bash
node main.js
```

The system will automatically use Python spoofer when enabled.

### Standalone Mode

Run the Python script directly:

```bash
python main.py --standalone
```

Or:

```bash
python3 main.py --standalone
```

Follow the interactive prompts to:
- Enter SMTP credentials
- Set spoofed email and display name
- Choose recipients (comma-separated or CSV file)
- Send emails

### CSV Batch Mode (Standalone)

Create a `targets.csv` file with email addresses:
```csv
email1@example.com
email2@example.com
email3@example.com
```

Then use:
```
Recipients: file:targets.csv
```

## Placeholders Supported

The Python spoofer supports the same placeholders as Node.js:

- `##victimemail##` - Recipient email address
- `##victimname##` - Recipient name (from email)
- `##victimdomain##` - Recipient domain
- `##victimdomain1##` - Capitalized domain name
- `##victimdomain2##` - Uppercase domain
- `##victimdomain3##` - Formatted domain (e.g., "Example.COM")
- `##victimdomain4##` - Lowercase domain
- `##victimb64email##` - Base64 encoded email

## Configuration

### From Node.js

The Python script receives configuration via JSON file with:
- SMTP settings
- Recipients list
- Spoofing configuration (From, Subject, Headers)
- HTML template path
- Attachments and CID images
- Rate limiting settings

### Custom Headers

You can set custom headers in `config.js`:
```javascript
spoofing: {
    customHeaders: {
        "Reply-To": "reply@example.com",
        "X-Mailer": "Microsoft Outlook 16.0",
        "X-Priority": "1",
        "Importance": "High"
    }
}
```

## Technical Details

### How It Works

1. **Envelope Sender**: Uses authenticated SMTP user (for SPF compliance)
2. **From Header**: Uses spoofed email address (displayed to recipient)
3. **Header Manipulation**: Sets professional headers to bypass filters
4. **Placeholder Replacement**: Processes placeholders before sending

### SMTP Connection

- Supports SSL (port 465) and STARTTLS (port 587, 25)
- Automatic SSL context creation
- Timeout handling (30 seconds default)
- Enhanced error messages

### Rate Limiting

When rate limiting is enabled:
- Calculates delay between emails
- Respects `emailsPerHour` setting
- Applies delay automatically

## Troubleshooting

### Python Not Found

On Windows, ensure Python is in PATH or use full path:
```javascript
// In main.js, modify pythonCmd if needed
const pythonCmd = 'C:\\Python39\\python.exe';
```

### Template Not Found

Ensure `letter.html` exists in the parent directory, or specify full path in config.

### SMTP Connection Errors

- Verify SMTP credentials
- Check firewall settings
- Ensure port is not blocked
- Try different ports (587, 465, 25)

## Security Notes

⚠️ **For Red Team Testing Only**

- This tool is designed for authorized security testing
- Always test against your own infrastructure first
- Document all activities
- Follow responsible disclosure practices
- Success rates vary based on target email security

## License

Part of the Red Team Email Dispatcher project.
