import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Amber — مطعم: شريط أقسام جانبي + بانر عروض + قائمة طلبات.
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
            title: StoreBrandTitle(store: s.store!, subtitle: s.palette.tagline),
            actions: [
              IconButton(
                onPressed: () => openCart(context),
                icon: Badge(label: Text('${s.cartCount}'), isLabelVisible: s.cartCount > 0, child: const Icon(Icons.shopping_basket_outlined)),
              ),
            ],
          ),
          body: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 104,
                color: s.palette.surface.withValues(alpha: 0.5),
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  children: [
                    _railItem(s, 'الكل', null),
                    ...s.categories.map((c) => _railItem(s, c.nameAr, c.slug)),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(14),
                  children: [
                    _banner(s),
                    const SizedBox(height: 16),
                    if (s.products.isNotEmpty) ...[
                      SectionHeader(title: 'طبق اليوم', palette: s.palette),
                      SpotlightCard(
                        product: s.products.first,
                        palette: s.palette,
                        label: 'مميز',
                        addLabel: 'اطلب الآن',
                        imageHeight: 170,
                        onTap: () => openProduct(context, s.products.first),
                        onAdd: () => s.addToCart(s.products.first),
                      ),
                      const SizedBox(height: 18),
                    ],
                    SectionHeader(title: 'الأطباق المتاحة', palette: s.palette),
                    if (s.products.isEmpty)
                      const StoreEmptyState(message: 'لا توجد أصناف متاحة الآن.')
                    else
                      ...s.products.map(
                        (p) => ProductTile(
                          product: p,
                          palette: s.palette,
                          style: ProductLayoutStyle.list,
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
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => openCart(context),
            backgroundColor: s.palette.primary,
            foregroundColor: Colors.white,
            label: Text('السلة (${s.cartCount})'),
            icon: const Icon(Icons.delivery_dining),
          ),
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
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: () => s.selectCategory(slug),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 6),
            child: Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: active ? Colors.white : s.palette.onSurface),
            ),
          ),
        ),
      ),
    );
  }

  Widget _banner(StoreSession s) {
    return Container(
      height: 132,
      padding: const EdgeInsets.all(18),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(s.palette.cornerRadius + 2),
        gradient: LinearGradient(begin: Alignment.topRight, end: Alignment.bottomLeft, colors: s.palette.heroGradient),
      ),
      child: Stack(
        children: [
          Positioned(right: -10, top: -10, child: Icon(Icons.local_fire_department, size: 96, color: Colors.white.withValues(alpha: 0.16))),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              Text('عروض اليوم', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
              SizedBox(height: 6),
              Text('ألذّ الأطباق · توصيل سريع', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20)),
            ],
          ),
        ],
      ),
    );
  }
}
