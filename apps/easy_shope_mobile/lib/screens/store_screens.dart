import 'package:flutter/material.dart';

import '../models/models.dart';
import '../state/store_session.dart';

class ProductDetailScreen extends StatelessWidget {
  const ProductDetailScreen({super.key, required this.product});

  final ProductInfo product;

  @override
  Widget build(BuildContext context) {
    final session = StoreScope.of(context);
    final palette = session.palette;
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل المنتج')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (product.imageUrl != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Image.network(product.imageUrl!, height: 220, width: double.infinity, fit: BoxFit.cover),
            )
          else
            Container(
              height: 180,
              alignment: Alignment.center,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), color: palette.surface),
              child: Text(product.title.characters.first, style: const TextStyle(fontSize: 48)),
            ),
          const SizedBox(height: 16),
          Text(product.title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(product.priceLabel, style: TextStyle(color: palette.accent, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text(product.description ?? 'منتج متاح في المتجر.', style: TextStyle(color: palette.onSurface.withValues(alpha: 0.8))),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () {
              session.addToCart(product);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تمت الإضافة للسلة')));
            },
            icon: const Icon(Icons.add_shopping_cart),
            label: const Text('أضف للسلة'),
          ),
        ],
      ),
    );
  }
}

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _address = TextEditingController();
  bool _submitting = false;
  String? _result;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _checkout(StoreSession session) async {
    if (_name.text.trim().isEmpty || _phone.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('أدخل اسم العميل ورقم الموبايل')));
      return;
    }
    setState(() {
      _submitting = true;
      _result = null;
    });
    try {
      final order = await session.checkout(
        name: _name.text.trim(),
        phone: _phone.text.trim(),
        email: _email.text.trim(),
        address: _address.text.trim(),
      );
      setState(() => _result = 'تم إنشاء الطلب ${order.orderId} — ${order.paymentStatus}');
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = StoreScope.of(context);
    final total = (session.cartTotalCents / 100).toStringAsFixed(2);
    return Scaffold(
      appBar: AppBar(title: const Text('السلة')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (session.cart.isEmpty)
            const Text('السلة فارغة.')
          else
            ...session.cart.map(
              (line) => ListTile(
                title: Text(line.product.title),
                subtitle: Text('${line.quantity} × ${line.product.priceLabel}'),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => session.removeFromCart(line.product.id),
                ),
              ),
            ),
          const Divider(),
          ListTile(title: const Text('الإجمالي'), trailing: Text('$total EGP', style: const TextStyle(fontWeight: FontWeight.bold))),
          const SizedBox(height: 16),
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'اسم العميل')),
          const SizedBox(height: 10),
          TextField(controller: _phone, decoration: const InputDecoration(labelText: 'موبايل العميل'), keyboardType: TextInputType.phone),
          const SizedBox(height: 10),
          TextField(controller: _email, decoration: const InputDecoration(labelText: 'البريد الإلكتروني'), keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 10),
          TextField(controller: _address, decoration: const InputDecoration(labelText: 'عنوان الشحن'), maxLines: 2),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: session.cart.isEmpty || _submitting ? null : () => _checkout(session),
            child: Text(_submitting ? 'جارٍ إنشاء الطلب...' : 'إتمام الطلب'),
          ),
          if (_result != null) ...[
            const SizedBox(height: 12),
            Text(_result!, style: TextStyle(color: session.palette.accent)),
          ],
        ],
      ),
    );
  }
}

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final _loginEmail = TextEditingController();
  final _loginPass = TextEditingController();
  final _regName = TextEditingController();
  final _regEmail = TextEditingController();
  final _regPhone = TextEditingController();
  final _regPass = TextEditingController();
  List<Map<String, dynamic>> _orders = [];
  bool _busy = false;

  @override
  void dispose() {
    _loginEmail.dispose();
    _loginPass.dispose();
    _regName.dispose();
    _regEmail.dispose();
    _regPhone.dispose();
    _regPass.dispose();
    super.dispose();
  }

  Future<void> _loadOrders(StoreSession session) async {
    setState(() => _busy = true);
    try {
      _orders = await session.api.fetchCustomerOrders();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = StoreScope.of(context);
    if (session.customerToken != null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('حسابي'),
          actions: [
            IconButton(
              onPressed: () {
                session.logoutCustomer();
                setState(() => _orders = []);
              },
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('مرحبًا ${session.customerName ?? ''}', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            FilledButton(onPressed: _busy ? null : () => _loadOrders(session), child: const Text('عرض طلباتي')),
            const SizedBox(height: 16),
            if (_orders.isEmpty && !_busy)
              const Text('لا توجد طلبات بعد.')
            else
              ..._orders.map(
                (o) => ListTile(
                  title: Text('${(o['total_cents'] as int? ?? 0) / 100} EGP'),
                  subtitle: Text('${o['status']} — ${o['payment_status']}'),
                ),
              ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('حساب العميل')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('سجّل دخولك أو أنشئ حسابًا لمتابعة الطلبات من هذا المتجر.'),
          const SizedBox(height: 16),
          TextField(controller: _loginEmail, decoration: const InputDecoration(labelText: 'البريد'), keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 10),
          TextField(controller: _loginPass, decoration: const InputDecoration(labelText: 'كلمة المرور'), obscureText: true),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    try {
                      await session.login(_loginEmail.text, _loginPass.text);
                      if (mounted) setState(() {});
                    } catch (e) {
                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                    } finally {
                      if (mounted) setState(() => _busy = false);
                    }
                  },
            child: const Text('دخول'),
          ),
          const Divider(height: 32),
          const Text('أو إنشاء حساب جديد', textAlign: TextAlign.center),
          const SizedBox(height: 12),
          TextField(controller: _regName, decoration: const InputDecoration(labelText: 'الاسم')),
          const SizedBox(height: 10),
          TextField(controller: _regEmail, decoration: const InputDecoration(labelText: 'البريد'), keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 10),
          TextField(controller: _regPhone, decoration: const InputDecoration(labelText: 'الموبايل'), keyboardType: TextInputType.phone),
          const SizedBox(height: 10),
          TextField(controller: _regPass, decoration: const InputDecoration(labelText: 'كلمة المرور'), obscureText: true),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    try {
                      await session.register(
                        name: _regName.text.trim(),
                        email: _regEmail.text.trim(),
                        phone: _regPhone.text.trim(),
                        password: _regPass.text,
                      );
                      if (mounted) setState(() {});
                    } catch (e) {
                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                    } finally {
                      if (mounted) setState(() => _busy = false);
                    }
                  },
            child: const Text('إنشاء حساب'),
          ),
        ],
      ),
    );
  }
}

void openProduct(BuildContext context, ProductInfo product) {
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ProductDetailScreen(product: product)));
}

void openCart(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const CartScreen()));
}

void openAccount(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AccountScreen()));
}
