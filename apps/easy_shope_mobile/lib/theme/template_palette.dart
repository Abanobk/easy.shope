import 'package:flutter/material.dart';

/// Visual identity per template (matches web storefront themes).
/// Each template has its own colors, gradients, corner radius and tagline so
/// the generated APK clearly reflects the chosen template.
class TemplatePalette {
  const TemplatePalette({
    required this.id,
    required this.label,
    required this.tagline,
    required this.primary,
    required this.secondary,
    required this.background,
    required this.surface,
    required this.onSurface,
    required this.accent,
    required this.chipBackground,
    this.cornerRadius = 20,
    this.heroColors = const [],
    this.brightness = Brightness.dark,
  });

  final String id;
  final String label;
  final String tagline;
  final Color primary;
  final Color secondary;
  final Color background;
  final Color surface;
  final Color onSurface;
  final Color accent;
  final Color chipBackground;
  final double cornerRadius;
  final List<Color> heroColors;

  /// Whether the storefront uses a light or dark surface scheme. This must match
  /// the template's web preview (e.g. Ocean/Violet/Rose are light, others dark).
  final Brightness brightness;

  Color get muted => onSurface.withValues(alpha: 0.66);
  Color get hairline => onSurface.withValues(alpha: 0.10);
  Color get softSurface => Color.alphaBlend(primary.withValues(alpha: 0.06), surface);
  List<Color> get heroGradient => heroColors.isNotEmpty ? heroColors : [primary, secondary];

  /// Soft elevation shadow for product cards (premium depth).
  List<BoxShadow> get cardShadow => [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.30),
          blurRadius: 16,
          offset: const Offset(0, 8),
        ),
      ];

  /// Colored glow shadow used under hero banners and primary actions.
  List<BoxShadow> get heroShadow => [
        BoxShadow(
          color: primary.withValues(alpha: 0.35),
          blurRadius: 24,
          offset: const Offset(0, 12),
        ),
      ];

  ThemeData toThemeData() {
    final isLight = brightness == Brightness.light;
    final colorScheme = isLight
        ? ColorScheme.light(
            primary: primary,
            secondary: secondary,
            surface: surface,
            onSurface: onSurface,
            tertiary: accent,
          )
        : ColorScheme.dark(
            primary: primary,
            secondary: secondary,
            surface: surface,
            onSurface: onSurface,
            tertiary: accent,
          );
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: background,
      fontFamily: 'Roboto',
      colorScheme: colorScheme,
    );
    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        surfaceTintColor: Colors.transparent,
        foregroundColor: onSurface,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(color: onSurface, fontSize: 18, fontWeight: FontWeight.w800),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(cornerRadius),
          side: BorderSide(color: hairline),
        ),
      ),
      dividerTheme: DividerThemeData(color: hairline, thickness: 1),
      chipTheme: ChipThemeData(
        backgroundColor: chipBackground,
        selectedColor: primary,
        side: BorderSide(color: hairline),
        labelStyle: TextStyle(color: onSurface, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        elevation: 0,
        height: 66,
        indicatorColor: primary.withValues(alpha: 0.22),
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: onSurface),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(color: states.contains(WidgetState.selected) ? primary : muted),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: chipBackground.withValues(alpha: 0.55),
        hintStyle: TextStyle(color: muted),
        prefixIconColor: muted,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        labelStyle: TextStyle(color: muted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          textStyle: const TextStyle(fontWeight: FontWeight.w800),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surface,
        contentTextStyle: TextStyle(color: onSurface, fontWeight: FontWeight.w600),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  static TemplatePalette forTheme(String themeId) {
    switch (themeId) {
      case 'violet':
        // تجميل — معاينة فاتحة وردية (vitrine-app--beauty).
        return const TemplatePalette(
          id: 'violet',
          label: 'Violet — تجميل',
          tagline: 'تجميل وعناية',
          brightness: Brightness.light,
          primary: Color(0xFFDB2777),
          secondary: Color(0xFFC4B5FD),
          background: Color(0xFFFFF7FB),
          surface: Color(0xFFFFFFFF),
          onSurface: Color(0xFF3B0764),
          accent: Color(0xFFBE185D),
          chipBackground: Color(0xFFFCE7F3),
          cornerRadius: 26,
          heroColors: [Color(0xFFEC4899), Color(0xFF8B5CF6)],
        );
      case 'emerald':
        // إلكترونيات — معاينة غامقة كحلي (vitrine-app--tech).
        return const TemplatePalette(
          id: 'emerald',
          label: 'Emerald — إلكترونيات',
          tagline: 'إلكترونيات وتقنية',
          brightness: Brightness.dark,
          primary: Color(0xFF10B981),
          secondary: Color(0xFF6EE7B7),
          background: Color(0xFF020617),
          surface: Color(0xFF0F172A),
          onSurface: Color(0xFFECFDF5),
          accent: Color(0xFF34D399),
          chipBackground: Color(0xFF1E293B),
          cornerRadius: 14,
          heroColors: [Color(0xFF059669), Color(0xFF0EA5E9)],
        );
      case 'amber':
        // مطعم — معاينة دافئة برتقالية (vitrine-app--food).
        return const TemplatePalette(
          id: 'amber',
          label: 'Amber — مطعم',
          tagline: 'قائمة اليوم · توصيل سريع',
          brightness: Brightness.dark,
          primary: Color(0xFFF59E0B),
          secondary: Color(0xFFFCD34D),
          background: Color(0xFF1C1208),
          surface: Color(0xFF292017),
          onSurface: Color(0xFFFFFBEB),
          accent: Color(0xFFFBBF24),
          chipBackground: Color(0xFF3D2A0A),
          cornerRadius: 22,
          heroColors: [Color(0xFFF59E0B), Color(0xFFEF4444)],
        );
      case 'rose':
        // منزل وديكور — معاينة فاتحة دافئة (vitrine-app--home).
        return const TemplatePalette(
          id: 'rose',
          label: 'Rose — منزل وديكور',
          tagline: 'منزل وديكور أنيق',
          brightness: Brightness.light,
          primary: Color(0xFFE11D48),
          secondary: Color(0xFFFDA4AF),
          background: Color(0xFFFAFAF9),
          surface: Color(0xFFFFFFFF),
          onSurface: Color(0xFF1C1917),
          accent: Color(0xFFBE123C),
          chipBackground: Color(0xFFF5F5F4),
          cornerRadius: 24,
          heroColors: [Color(0xFFF43F5E), Color(0xFFA855F7)],
        );
      case 'slate':
        // إبداعي — معاينة غامقة بنفسجية (vitrine-app--creative).
        return const TemplatePalette(
          id: 'slate',
          label: 'Slate — إبداعي',
          tagline: 'تصميم بسيط وأنيق',
          brightness: Brightness.dark,
          primary: Color(0xFF7C3AED),
          secondary: Color(0xFFA78BFA),
          background: Color(0xFF1E1B4B),
          surface: Color(0xFF312E81),
          onSurface: Color(0xFFF8FAFC),
          accent: Color(0xFFC4B5FD),
          chipBackground: Color(0xFF3730A3),
          cornerRadius: 10,
          heroColors: [Color(0xFF4C1D95), Color(0xFF7C3AED)],
        );
      case 'ocean':
      default:
        // أزياء — معاينة فاتحة بيضاء/سماوية (vitrine-app--light).
        return const TemplatePalette(
          id: 'ocean',
          label: 'Ocean — أزياء',
          tagline: 'أزياء وإكسسوارات',
          brightness: Brightness.light,
          primary: Color(0xFF0EA5E9),
          secondary: Color(0xFF6366F1),
          background: Color(0xFFF8FAFC),
          surface: Color(0xFFFFFFFF),
          onSurface: Color(0xFF0F172A),
          accent: Color(0xFF0284C7),
          chipBackground: Color(0xFFE2E8F0),
          cornerRadius: 20,
          heroColors: [Color(0xFF0EA5E9), Color(0xFF6366F1)],
        );
    }
  }
}
