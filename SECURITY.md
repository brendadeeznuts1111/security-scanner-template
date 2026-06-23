# Security Policy

This is a template for building a Bun security scanner. If you are using this
template to build your own scanner, please follow these guidelines.

## Supported Versions

Only the latest released version of this template is supported. Because this is
a template, consumers are expected to fork and maintain their own scanner.

## Reporting a Vulnerability

If you discover a security issue in the template itself, please open a private
issue or contact the maintainers listed in the package metadata.

If you are using this template to build your own scanner, please follow your
organization's responsible disclosure process.

## Security Scanner Behavior

This scanner cancels the installation process when:

- A package matches a known fatal threat (malware, backdoor, botnet).
- The scanner throws an error while fetching or validating the threat feed.

This is a defensive precaution. Always ensure your threat feed is reachable and
valid before relying on the scanner in production.
