import 'package:flutter/material.dart';

/// Visual identity per compile-time template (matches web storefront themes).
class TemplatePalette {
  const TemplatePalette({
    required this.id,
    required this.label,
    required this.primary,
    required this.secondary,
    required this.background,
    required this.surface,
    required this.onSurface,
    required this.accent,
    required this.chipBackground,
  });

  final String id;
  final String label;
  final Color primary;
  final Color secondary;
  final Color background;
  final Color surface;
  final Color onSurface;
  final Color accent;
  final Color chipBackground;

  ThemeData toThemeData() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      colorScheme: ColorScheme.dark(
        primary: primary,
        secondary: secondary,
        surface: surface,
        onSurface: onSurface,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: onSurface,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: chipBackground,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        labelStyle: TextStyle(color: onSurface.withValues(alpha: 0.7)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    );
  }

  static TemplatePalette forTheme(String themeId) {
    switch (themeId) {
      case 'violet':
        return const TemplatePalette(
          id: 'violet',
          label: 'Violet — تجميل',
          primary: Color(0xFF8B5CF6),
          secondary: Color(0xFFC4B5FD),
          background: Color(0xFF1E1033),
          surface: Color(0xFF2D1B4E),
          onSurface: Color(0xFFF5F3FF),
          accent: Color(0xFFA78BFA),
          chipBackground: Color(0xFF3B2667),
        );
      case 'emerald':
        return const TemplatePalette(
          id: 'emerald',
          label: 'Emerald — إلكترونيات',
          primary: Color(0xFF10B981),
          secondary: Color(0xFF6EE7B7),
          background: Color(0xFF022C22),
          surface: Color(0xFF064E3B),
          onSurface: Color(0xFFECFDF5),
          accent: Color(0xFF34D399),
          chipBackground: Color(0xFF065F46),
        );
      case 'amber':
        return const TemplatePalette(
          id: 'amber',
          label: 'Amber — مطعم',
          primary: Color(0xFFF59E0B),
          secondary: Color(0xFFFCD34D),
          background: Color(0xFF1C1208),
          surface: Color(0xFF292017),
          onSurface: Color(0xFFFFFBEB),
          accent: Color(0xFFFBBF24),
          chipBackground: Color(0xFF3D2A0A),
        );
      case 'rose':
        return const TemplatePalette(
          id: 'rose',
          label: 'Rose — منزل وديكور',
          primary: Color(0xFFF43F5E),
          secondary: Color(0xFFFDA4AF),
          background: Color(0xFF1F0A12),
          surface: Color(0xFF3F1020),
          onSurface: Color(0xFFFFF1F2),
          accent: Color(0xFFFB7185),
          chipBackground: Color(0xFF4C0519),
        );
      case 'slate':
        return const TemplatePalette(
          id: 'slate',
          label: 'Slate — إبداعي',
          primary: Color(0xFF64748B),
          secondary: Color(0xFF94A3B8),
          background: Color(0xFF0F172A),
          surface: Color(0xFF1E293B),
          onSurface: Color(0xFFF8FAFC),
          accent: Color(0xFFCBD5E1),
          chipBackground: Color(0xFF334155),
        );
      case 'ocean':
      default:
        return const TemplatePalette(
          id: 'ocean',
          label: 'Ocean — أزياء',
          primary: Color(0xFF0EA5E9),
          secondary: Color(0xFF7DD3FC),
          background: Color(0xFF020617),
          surface: Color(0xFF0F172A),
          onSurface: Color(0xFFF0F9FF),
          accent: Color(0xFF38BDF8),
          chipBackground: Color(0xFF1E3A5F),
        );
    }
  }
}
