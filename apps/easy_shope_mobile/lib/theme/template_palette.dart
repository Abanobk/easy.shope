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
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      fontFamily: 'Roboto',
      colorScheme: ColorScheme.dark(
        primary: primary,
        secondary: secondary,
        surface: surface,
        onSurface: onSurface,
        tertiary: accent,
      ),
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
        return const TemplatePalette(
          id: 'violet',
          label: 'Violet — تجميل',
          tagline: 'تجميل وعناية',
          primary: Color(0xFF8B5CF6),
          secondary: Color(0xFFC4B5FD),
          background: Color(0xFF1E1033),
          surface: Color(0xFF2D1B4E),
          onSurface: Color(0xFFF5F3FF),
          accent: Color(0xFFA78BFA),
          chipBackground: Color(0xFF3B2667),
          cornerRadius: 26,
          heroColors: [Color(0xFF8B5CF6), Color(0xFFEC4899)],
        );
      case 'emerald':
        return const TemplatePalette(
          id: 'emerald',
          label: 'Emerald — إلكترونيات',
          tagline: 'إلكترونيات وتقنية',
          primary: Color(0xFF10B981),
          secondary: Color(0xFF6EE7B7),
          background: Color(0xFF022C22),
          surface: Color(0xFF064E3B),
          onSurface: Color(0xFFECFDF5),
          accent: Color(0xFF34D399),
          chipBackground: Color(0xFF065F46),
          cornerRadius: 14,
          heroColors: [Color(0xFF059669), Color(0xFF0EA5E9)],
        );
      case 'amber':
        return const TemplatePalette(
          id: 'amber',
          label: 'Amber — مطعم',
          tagline: 'قائمة اليوم · توصيل سريع',
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
        return const TemplatePalette(
          id: 'rose',
          label: 'Rose — منزل وديكور',
          tagline: 'منزل وديكور أنيق',
          primary: Color(0xFFF43F5E),
          secondary: Color(0xFFFDA4AF),
          background: Color(0xFF1F0A12),
          surface: Color(0xFF3F1020),
          onSurface: Color(0xFFFFF1F2),
          accent: Color(0xFFFB7185),
          chipBackground: Color(0xFF4C0519),
          cornerRadius: 24,
          heroColors: [Color(0xFFF43F5E), Color(0xFFA855F7)],
        );
      case 'slate':
        return const TemplatePalette(
          id: 'slate',
          label: 'Slate — إبداعي',
          tagline: 'تصميم بسيط وأنيق',
          primary: Color(0xFF64748B),
          secondary: Color(0xFF94A3B8),
          background: Color(0xFF0F172A),
          surface: Color(0xFF1E293B),
          onSurface: Color(0xFFF8FAFC),
          accent: Color(0xFFCBD5E1),
          chipBackground: Color(0xFF334155),
          cornerRadius: 10,
          heroColors: [Color(0xFF334155), Color(0xFF0F172A)],
        );
      case 'ocean':
      default:
        return const TemplatePalette(
          id: 'ocean',
          label: 'Ocean — أزياء',
          tagline: 'أزياء وإكسسوارات',
          primary: Color(0xFF0EA5E9),
          secondary: Color(0xFF7DD3FC),
          background: Color(0xFF020617),
          surface: Color(0xFF0F172A),
          onSurface: Color(0xFFF0F9FF),
          accent: Color(0xFF38BDF8),
          chipBackground: Color(0xFF1E3A5F),
          cornerRadius: 20,
          heroColors: [Color(0xFF0EA5E9), Color(0xFF6366F1)],
        );
    }
  }
}
