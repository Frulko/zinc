// The login token, kept in the system keychain (zinc:secure-store), never in a plain file.
import * as SecureStore from 'zinc:secure-store';
import { SECRET_TOKEN_KEY } from '../constants';

export async function loadToken(): Promise<string> {
  try { const t = await SecureStore.getItemAsync(SECRET_TOKEN_KEY); return t !== null ? t : ''; } catch (e) { return ''; }
}
export async function saveToken(token: string): Promise<void> { await SecureStore.setItemAsync(SECRET_TOKEN_KEY, token); }
export async function forgetToken(): Promise<void> { await SecureStore.deleteItemAsync(SECRET_TOKEN_KEY); }
