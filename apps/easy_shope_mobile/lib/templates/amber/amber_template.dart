import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Amber — مطعم: شريط أقسام جانبي + بانر + شبكة.
class AmberTemplate extends StatelessWidget {
  const AmberTemplate({super.key, required this.session});

  final StoreSession session;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final s = session;
        if (s.loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        if (s.error != null) return Scaffold(body: Center(child: Text(s.error!)));
        return Scaffold(
          appBar: AppBar(
            title: StoreBrandTitle(store: s.store!),
            actions: [
              Chip(label: const Text('توصيل متاح'), backgroundColor: s.palette.primary.withValues(alpha: 0.25)),
              IconButton(onPressed: () => openCart(context), icon: Badge(label: Text('${s.cartCount}'), child: const Icon(Icons.delivery_dining))),
            ],
          ),
          body: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 108,
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  children: [
                    _railItem(s, 'الكل', null),
                    ...s.categories.map((c) => _railItem(s, c.nameAr, c.slug)),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    _banner(s),
                    const SizedBox(height: 12),
                    ...s.products.map(
                      (p) => ProductTile(
                        product: p,
                        palette: s.palette,
                        addLabel: 'اطلب الآن',
                        onAdd: () => s.addToCart(p),
                        onTap: () => openProduct(context, p),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(onPressed: () => openAccount(context), label: const Text('حسابي'), icon: const Icon(Icons.person)),
        );
      },
    );
  }

  Widget _railItem(StoreSession s, String label, String? slug) {
    final active = s.selectedCategorySlug == slug;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Material(
        color: active ? s.palette.primary : s.palette.chipBackground,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: () => s.selectCategory(slug),
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
            child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: active ? Colors.white : s.palette.onSurface)),
          ),
        ),
      ),
    );
  }

  Widget _banner(StoreSession s) {
    return Container(
      height: 120,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(colors: [s.palette.primary, s.palette.secondary.withValues(alpha: 0.6)]),
      ),
      child: const Align(
        alignment: Alignment.bottomRight,
        child: Text('قائمة اليوم · توصيل متاح', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
      ),
    );
  }
}
