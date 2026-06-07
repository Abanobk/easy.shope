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

  static bool get isConfigured => tenantSlug.trim().isNotEmpty;
}
