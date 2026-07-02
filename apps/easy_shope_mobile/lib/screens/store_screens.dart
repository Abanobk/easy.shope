import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../state/store_session.dart';
import '../theme/template_palette.dart';

class ProductDetailScreen extends StatelessWidget {
  const ProductDetailScreen({super.key, required this.product});

  final ProductInfo product;

  @override
  Widget build(BuildContext context) {
    final session = StoreScope.of(context);
    final palette = session.palette;
    final outOfStock = product.stockQuantity <= 0;
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل المنتج')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(palette.cornerRadius + 4),
              boxShadow: palette.cardShadow,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(palette.cornerRadius + 4),
              child: (product.imageUrl != null && product.imageUrl!.isNotEmpty)
                  ? Image.network(
                      product.imageUrl!,
                      height: 280,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => _imageFallback(palette),
                    )
                  : _imageFallback(palette),
            ),
          ),
          const SizedBox(height: 18),
          Text(product.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(product.priceLabel, style: TextStyle(color: palette.accent, fontSize: 22, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: (outOfStock ? Colors.red : palette.primary).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  outOfStock ? 'غير متوفر' : 'متوفر · ${product.stockQuantity} قطعة',
                  style: TextStyle(color: outOfStock ? Colors.red.shade200 : palette.accent, fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('الوصف', style: TextStyle(color: palette.muted, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(
            product.description?.trim().isNotEmpty == true ? product.description! : 'منتج متاح في المتجر.',
            style: TextStyle(color: palette.onSurface.withValues(alpha: 0.85), height: 1.7),
          ),
          const SizedBox(height: 28),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: FilledButton.icon(
            onPressed: outOfStock
                ? null
                : () {
                    session.addToCart(product);
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تمت الإضافة للسلة')));
                  },
            icon: const Icon(Icons.add_shopping_cart),
            label: Text(outOfStock ? 'غير متوفر حاليًا' : 'أضف للسلة — ${product.priceLabel}'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
          ),
        ),
      ),
    );
  }

  Widget _imageFallback(TemplatePalette palette) {
    return Container(
      height: 280,
      alignment: Alignment.center,
      decoration: BoxDecoration(gradient: LinearGradient(colors: palette.heroGradient)),
      child: Text(
        product.title.characters.isEmpty ? '?' : product.title.characters.first,
        style: const TextStyle(fontSize: 64, fontWeight: FontWeight.bold, color: Colors.white),
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
  final _coupon = TextEditingController();
  String _governorate = 'cairo';
  String _paymentMethod = 'paymob';
  bool _submitting = false;
  String? _result;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _address.dispose();
    _coupon.dispose();
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
        governorate: _governorate,
        couponCode: _coupon.text.trim(),
        paymentMethod: _paymentMethod,
      );
      if (order.checkoutUrl != null && order.checkoutUrl!.isNotEmpty) {
        final uri = Uri.parse(order.checkoutUrl!);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      }
      setState(() {
        _result = 'تم إنشاء الطلب ${order.orderId} — ${order.paymentStatus}${order.trackingUrl != null ? '\n${order.trackingUrl}' : ''}';
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = StoreScope.of(context);
    final palette = session.palette;
    final total = (session.cartTotalCents / 100).toStringAsFixed(2);
    return Scaffold(
      appBar: AppBar(title: const Text('السلة')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (session.cart.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(
                children: [
                  Icon(Icons.shopping_cart_outlined, size: 56, color: palette.muted),
                  const SizedBox(height: 12),
                  Text('السلة فارغة.', style: TextStyle(color: palette.muted, fontWeight: FontWeight.w600)),
                ],
              ),
            )
          else
            ...session.cart.map(
              (line) => Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                          width: 60,
                          height: 60,
                          child: (line.product.imageUrl != null && line.product.imageUrl!.isNotEmpty)
                              ? Image.network(line.product.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: palette.chipBackground))
                              : Container(
                                  color: palette.chipBackground,
                                  alignment: Alignment.center,
                                  child: Text(line.product.title.characters.first, style: const TextStyle(fontWeight: FontWeight.bold)),
                                ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(line.product.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 4),
                            Text(line.product.priceLabel, style: TextStyle(color: palette.accent, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                      _QtyStepper(
                        quantity: line.quantity,
                        palette: palette,
                        onMinus: () {
                          if (line.quantity > 1) {
                            session.decrementCartLine(line.product.id);
                          } else {
                            session.removeFromCart(line.product.id);
                          }
                        },
                        onPlus: () => session.addToCart(line.product),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (session.cart.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: palette.softSurface,
                borderRadius: BorderRadius.circular(palette.cornerRadius),
                border: Border.all(color: palette.hairline),
              ),
              child: Row(
                children: [
                  const Text('الإجمالي', style: TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Text('$total EGP', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: palette.accent)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'اسم العميل')),
          const SizedBox(height: 10),
          TextField(controller: _phone, decoration: const InputDecoration(labelText: 'موبايل العميل'), keyboardType: TextInputType.phone),
          const SizedBox(height: 10),
          TextField(controller: _email, decoration: const InputDecoration(labelText: 'البريد الإلكتروني'), keyboardType: TextInputType.emailAddress),
          const SizedBox(height: 10),
          TextField(controller: _address, decoration: const InputDecoration(labelText: 'عنوان الشحن'), maxLines: 2),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: _governorate,
            decoration: const InputDecoration(labelText: 'المحافظة'),
            items: const [
              DropdownMenuItem(value: 'cairo', child: Text('القاهرة')),
              DropdownMenuItem(value: 'giza', child: Text('الجيزة')),
              DropdownMenuItem(value: 'alexandria', child: Text('الإسكندرية')),
              DropdownMenuItem(value: 'other', child: Text('محافظات أخرى')),
            ],
            onChanged: (v) => setState(() => _governorate = v ?? 'cairo'),
          ),
          const SizedBox(height: 10),
          TextField(controller: _coupon, decoration: const InputDecoration(labelText: 'كود الخصم (اختياري)')),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: _paymentMethod,
            decoration: const InputDecoration(labelText: 'طريقة الدفع'),
            items: const [
              DropdownMenuItem(value: 'paymob', child: Text('بطاقة (Paymob)')),
              DropdownMenuItem(value: 'cod', child: Text('الدفع عند الاستلام')),
              DropdownMenuItem(value: 'fawry', child: Text('Fawry')),
            ],
            onChanged: (v) => setState(() => _paymentMethod = v ?? 'paymob'),
          ),
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

class _QtyStepper extends StatelessWidget {
  const _QtyStepper({required this.quantity, required this.palette, required this.onMinus, required this.onPlus});

  final int quantity;
  final TemplatePalette palette;
  final VoidCallback onMinus;
  final VoidCallback onPlus;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: palette.chipBackground,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: palette.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _btn(Icons.remove, onMinus),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Text('$quantity', style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
          _btn(Icons.add, onPlus),
        ],
      ),
    );
  }

  Widget _btn(IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Padding(padding: const EdgeInsets.all(6), child: Icon(icon, size: 18, color: palette.onSurface)),
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
