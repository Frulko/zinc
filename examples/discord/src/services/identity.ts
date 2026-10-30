// The client properties: one object for IDENTIFY and, base64 JSON, for the X-Super-Properties header of every HTTP request.
import { USER_AGENT, BROWSER_VERSION, CLIENT_BUILD_NUMBER, LOCALE } from '../constants';

const launchId = crypto.randomUUID();

export function clientProperties(): any {
  return {
    os: 'Mac OS X', browser: 'Chrome', device: '', device_model_name: '', system_locale: LOCALE, has_client_mods: false, browser_user_agent: USER_AGENT,
    browser_version: BROWSER_VERSION, os_version: '10.15.7', referrer: '', referring_domain: '', referrer_current: '',
    referring_domain_current: '', release_channel: 'stable', client_build_number: CLIENT_BUILD_NUMBER, client_event_source: null,
    client_launch_id: launchId, client_app_state: 'focused',
  };
}

export const superProperties = btoa(JSON.stringify(clientProperties()));
