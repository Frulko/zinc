// The desktop's openLink: React Native's Linking (zinc.json "permissions": ["opener"] and its "scopes" allow https links).
import { Linking } from 'zinc:react-native/linking';
export function openLink(url: string): Promise<void> { return Linking.openURL(url); }
