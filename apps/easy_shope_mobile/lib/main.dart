import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'screens/store_entry_screen.dart';
import 'state/store_session.dart';
import 'templates/template_registry.dart';
import 'theme/template_palette.dart';
import 'widgets/whatsapp_support_button.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const EasyShopeMobileApp());
}

class EasyShopeMobileApp extends StatefulWidget {
  const EasyShopeMobileApp({super.key});

  @override
  State<EasyShopeMobileApp> createState() => _EasyShopeMobileAppState();
}

class _EasyShopeMobileAppState extends State<EasyShopeMobileApp> {
  late final StoreSession _session;

  @override
  void initState() {
    super.initState();
    _session = StoreSession();
    if (AppConfig.isConfigured) {
      _session.bootstrap();
    }
  }

  @override
  void dispose() {
    _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!AppConfig.isConfigured) {
      return MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'APK غير مضبوط.\n'
                'GitHub Actions يمرّر TENANT_SLUG و STOREFRONT_THEME و STOREFRONT_BASE_URL.',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      );
    }

    return ListenableBuilder(
      listenable: _session,
      builder: (context, _) {
        final palette = TemplatePalette.forTheme(_session.activeTheme);

        if (_session.loading) {
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: palette.toThemeData(),
            home: const Scaffold(body: Center(child: CircularProgressIndicator())),
          );
        }

        if (_session.error != null) {
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: palette.toThemeData(),
            home: Scaffold(
              body: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text('تعذر تحميل المتجر:\n${_session.error}', textAlign: TextAlign.center),
                ),
              ),
            ),
          );
        }

        final home = _session.showEntryGate
            ? const StoreEntryScreen()
            : buildTemplateApp(_session, theme: _session.activeTheme);

        return StoreScope(
          notifier: _session,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            title: _session.store?.displayName ?? 'Easy Shope',
            theme: palette.toThemeData(),
            builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
            home: Stack(
              fit: StackFit.expand,
              children: [
                home,
                if (!_session.showEntryGate) const WhatsAppSupportButton(),
              ],
            ),
          ),
        );
      },
    );
  }
}
