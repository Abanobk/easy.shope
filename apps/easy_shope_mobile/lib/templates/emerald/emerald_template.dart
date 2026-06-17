import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Emerald — إلكترونيات: hero + قائمة أفقية للمنتجات + شريط سفلي.
class EmeraldTemplate extends StatefulWidget {
  const EmeraldTemplate({super.key, required this.session});

  final StoreSession session;

  @override
  State<EmeraldTemplate> createState() => _EmeraldTemplateState();
}

class _EmeraldTemplateState extends State<EmeraldTemplate> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) {
        final s = widget.session;
        if (s.loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        if (s.error != null) return Scaffold(body: Center(child: Text(s.error!)));
        return Scaffold(
          appBar: AppBar(
            title: StoreBrandTitle(store: s.store!, subtitle: s.palette.tagline),
            actions: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Chip(
                  avatar: Icon(Icons.bolt, size: 16, color: s.palette.accent),
                  label: const Text('Tech hub'),
                  backgroundColor: s.palette.chipBackground,
                ),
              ),
            ],
          ),
          body: _tab == 0
              ? _catalog(s)
              : _tab == 1
                  ? const CartScreen()
                  : const AccountScreen(),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              const NavigationDestination(icon: Icon(Icons.devices_outlined), selectedIcon: Icon(Icons.devices), label: 'المنتجات'),
              NavigationDestination(
                icon: Badge(label: Text('${s.cartCount}'), isLabelVisible: s.cartCount > 0, child: const Icon(Icons.shopping_cart_outlined)),
                label: 'السلة',
              ),
              const NavigationDestination(icon: Icon(Icons.account_circle_outlined), selectedIcon: Icon(Icons.account_circle), label: 'حسابي'),
            ],
          ),
        );
      },
    );
  }

  Widget _catalog(StoreSession s) {
    return RefreshIndicator(
      onRefresh: s.bootstrap,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StoreHero(
            palette: s.palette,
            eyebrow: 'عروض التقنية',
            title: s.store!.displayName,
            subtitle: 'أحدث الأجهزة والإكسسوارات بضمان وأسعار تنافسية.',
            logoUrl: s.store!.logoUrl,
            height: 150,
          ),
          const SizedBox(height: 16),
          StoreSearchBar(onSubmitted: s.setSearch),
          const SizedBox(height: 18),
          if (s.products.length > 2) ...[
            SectionHeader(title: 'الأكثر مبيعًا', palette: s.palette),
            FeaturedRail(
              products: s.products.take(8).toList(),
              palette: s.palette,
              onTap: (p) => openProduct(context, p),
              onAdd: (p) => s.addToCart(p),
            ),
            const SizedBox(height: 18),
          ],
          CategoryStrip(categories: s.categories, selected: s.selectedCategorySlug, onSelect: s.selectCategory, palette: s.palette),
          const SizedBox(height: 16),
          SectionHeader(title: 'كل الأجهزة', palette: s.palette),
          if (s.products.isEmpty)
            const StoreEmptyState()
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 14,
                crossAxisSpacing: 14,
                childAspectRatio: 0.60,
              ),
              itemCount: s.products.length,
              itemBuilder: (_, i) => ProductTile(
                product: s.products[i],
                palette: s.palette,
                addLabel: 'أضف للسلة',
                onAdd: () => s.addToCart(s.products[i]),
                onTap: () => openProduct(context, s.products[i]),
              ),
            ),
        ],
      ),
    );
  }
}
