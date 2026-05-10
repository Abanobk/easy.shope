import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// قيم مضمّنة وقت البناء من GitHub Actions (--dart-define).
const String _kTenantSlug = String.fromEnvironment('TENANT_SLUG', defaultValue: '');
const String _kStorefrontBase = String.fromEnvironment(
  'STOREFRONT_BASE_URL',
  defaultValue: 'https://shope.easytecheg.net',
);

String _storefrontLaunchUrl() {
  final trimmed = _kStorefrontBase.trim().replaceAll(RegExp(r'/+$'), '');
  if (_kTenantSlug.trim().isEmpty) return trimmed;
  final q = Uri.encodeQueryComponent(_kTenantSlug.trim());
  return '$trimmed/?store=$q';
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const EasyShopeMobileApp());
}

class EasyShopeMobileApp extends StatelessWidget {
  const EasyShopeMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Easy Shope',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal), useMaterial3: true),
      home: const StoreWebShell(),
    );
  }
}

class StoreWebShell extends StatefulWidget {
  const StoreWebShell({super.key});

  @override
  State<StoreWebShell> createState() => _StoreWebShellState();
}

class _StoreWebShellState extends State<StoreWebShell> {
  late final WebViewController _controller;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    final initial = Uri.parse(_storefrontLaunchUrl());
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (value) {
            if (mounted) setState(() => _progress = value);
          },
        ),
      )
      ..loadRequest(initial);
  }

  @override
  Widget build(BuildContext context) {
    if (_kTenantSlug.trim().isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Easy Shope')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'هذا البناء لا يحتوي على متجر مضبوط.\n'
              'أعد طلب APK من لوحة التاجر (يُمرَّر slug المتجر أثناء البناء).',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('المتجر'),
        bottom: _progress < 100 && _progress > 0
            ? PreferredSize(
                preferredSize: const Size.fromHeight(3),
                child: LinearProgressIndicator(value: _progress / 100, minHeight: 3),
              )
            : null,
      ),
      body: WebViewWidget(controller: _controller),
    );
  }
}
