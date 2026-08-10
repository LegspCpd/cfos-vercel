import { ConfidentialClientApplication } from '@azure/msal-node';

// MSAL client factory. Lazily created at request time so Next.js build-time page-data
// collection (where env vars may be empty) doesn't throw invalid_client_credential.
export function getMsalClient(): ConfidentialClientApplication {
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`,
    },
  });
}
