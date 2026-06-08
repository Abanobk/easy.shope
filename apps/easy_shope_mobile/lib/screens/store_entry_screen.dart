import 'package:flutter/material.dart';

import '../state/store_session.dart';
import '../widgets/store_widgets.dart';

/// Login / register gate before entering the storefront.
class StoreEntryScreen extends StatefulWidget {
  const StoreEntryScreen({super.key});

  @override
  State<StoreEntryScreen> createState() => _StoreEntryScreenState();
}

class _StoreEntryScreenState extends State<StoreEntryScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _loginEmail = TextEditingController();
  final _loginPass = TextEditingController();
  final _regName = TextEditingController();
  final _regEmail = TextEditingController();
  final _regPhone = TextEditingController();
  final _regPass = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _loginEmail.dispose();
    _loginPass.dispose();
    _regName.dispose();
    _regEmail.dispose();
    _regPhone.dispose();
    _regPass.dispose();
    super.dispose();
  }

  Future<void> _login(StoreSession session) async {
    setState(() => _busy = true);
    try {
      await session.login(_loginEmail.text.trim(), _loginPass.text);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _register(StoreSession session) async {
    setState(() => _busy = true);
    try {
      await session.register(
        name: _regName.text.trim(),
        email: _regEmail.text.trim(),
        phone: _regPhone.text.trim(),
        password: _regPass.text,
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = StoreScope.of(context);
    final store = session.store;
    final palette = session.palette;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const SizedBox(height: 12),
            Center(
              child: Column(
                children: [
                  if (store != null) StoreLogoImage(logoUrl: store.logoUrl, size: 72, radius: 18),
                  const SizedBox(height: 14),
                  Text(store?.displayName ?? 'متجرك', style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
                  if (store?.serialCode != null && store!.serialCode!.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      'رقم المتجر: ${store.serialCode}',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: palette.accent, fontWeight: FontWeight.w800, letterSpacing: 0.4),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Text(
                    'سجّل دخولك أو أنشئ حسابًا لمتابعة الطلبات، أو تسوق كزائر.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: palette.onSurface.withValues(alpha: 0.75)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            TabBar(
              controller: _tabs,
              tabs: const [
                Tab(text: 'دخول'),
                Tab(text: 'حساب جديد'),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 320,
              child: TabBarView(
                controller: _tabs,
                children: [
                  Column(
                    children: [
                      TextField(controller: _loginEmail, decoration: const InputDecoration(labelText: 'البريد'), keyboardType: TextInputType.emailAddress),
                      const SizedBox(height: 10),
                      TextField(controller: _loginPass, decoration: const InputDecoration(labelText: 'كلمة المرور'), obscureText: true),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _busy ? null : () => _login(session),
                        child: Text(_busy ? 'جارٍ الدخول...' : 'دخول'),
                      ),
                    ],
                  ),
                  ListView(
                    children: [
                      TextField(controller: _regName, decoration: const InputDecoration(labelText: 'الاسم')),
                      const SizedBox(height: 10),
                      TextField(controller: _regEmail, decoration: const InputDecoration(labelText: 'البريد'), keyboardType: TextInputType.emailAddress),
                      const SizedBox(height: 10),
                      TextField(controller: _regPhone, decoration: const InputDecoration(labelText: 'الموبايل'), keyboardType: TextInputType.phone),
                      const SizedBox(height: 10),
                      TextField(controller: _regPass, decoration: const InputDecoration(labelText: 'كلمة المرور'), obscureText: true),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _busy ? null : () => _register(session),
                        child: Text(_busy ? 'جارٍ التسجيل...' : 'إنشاء حساب'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy ? null : session.continueAsGuest,
              child: const Text('تسوق كزائر بدون حساب'),
            ),
          ],
        ),
      ),
    );
  }
}
