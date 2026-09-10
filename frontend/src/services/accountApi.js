/** Authenticated adapters for self-service data access and account erasure. */
import { ApiClient, ENDPOINTS } from './api.js';
import { getAccessToken } from '../utils/authSession.js';

function accountApi() {
  return new ApiClient({ Authorization: `Bearer ${getAccessToken()}` });
}

/** Download the server-generated JSON export using its safe attachment name. */
export async function downloadAccountData() {
  const { blob, filename } = await accountApi().httpRequestBlob(
    ENDPOINTS.ACCOUNT.EXPORT,
    'GET',
    null,
    'Nie udało się przygotować eksportu danych.',
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'cv-studio-data.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Permanently erase the active account after exact username confirmation. */
export function deleteAccount(confirmation) {
  return accountApi().httpRequest(
    ENDPOINTS.ACCOUNT.ROOT,
    'DELETE',
    JSON.stringify({ confirmation }),
    'Nie udało się usunąć konta.',
  );
}
