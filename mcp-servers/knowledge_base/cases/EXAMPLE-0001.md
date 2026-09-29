# Example: NullPointerException in SettingsProvider on boot

- PLM: EXAMPLE-0001 (sample entry — replace with real exported cases)
- Type: SET

## Signature
FATAL EXCEPTION: main  java.lang.NullPointerException at com.android.providers.settings.SettingsProvider.getSetting

## Root cause
Settings read before the user was unlocked; the cache returned null.

## Fix
Guard the lookup until USER_UNLOCKED and fall back to defaults.
