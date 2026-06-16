/// Compile-time white-label configuration (GitHub Actions --dart-define).
class AppConfig {
  static const tenantSlug = String.fromEnvironment('TENANT_SLUG', defaultValue: '');
  static const storefrontTheme = String.fromEnvironment('STOREFRONT_THEME', defaultValue: 'ocean');
  static const apiBaseUrl = String.fromEnvironment(
    'STOREFRONT_BASE_URL',
    defaultValue: 'https://shope.easytecheg.net',
  );

  static const supportedThemes = ['ocean', 'violet', 'emerald', 'amber', 'rose', 'slate'];

  static String get normalizedTheme {
    final t = storefrontTheme.trim().toLowerCase();
    return supportedThemes.contains(t) ? t : 'ocean';
  }

  static String get apiRoot {
    final base = apiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    return '$base/api';
  }

  /// Resolves a media reference returned by the API. Absolute http(s) URLs are
  /// returned as-is; relative paths (e.g. /api/media/...) are prefixed with the
  /// configured API base so Image.network can load them.
  static String? resolveMedia(String? raw) {
    if (raw == null) return null;
    final value = raw.trim();
    if (value.isEmpty) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    final base = apiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    if (value.startsWith('/')) return '$base$value';
    return value;
  }

  static bool get isConfigured => tenantSlug.trim().isNotEmpty;
}
