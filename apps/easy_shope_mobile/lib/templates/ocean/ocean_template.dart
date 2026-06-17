import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Ocean — أزياء: hero متدرّج + شبكة منتجات + شريط سفلي + تبويبات أقسام.
class OceanTemplate extends StatefulWidget {
  const OceanTemplate({super.key, required this.session});

  final StoreSession session;

  @override
  State<OceanTemplate> createState() => _OceanTemplateState();
}

class _OceanTemplateState extends State<OceanTemplate> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) {
        final s = widget.session;
        if (s.loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        if (s.error != null) return Scaffold(body: Center(child: Text(s.error!)));
        final store = s.store!;
        return Scaffold(
          appBar: AppBar(
            title: StoreBrandTitle(store: store, subtitle: s.palette.tagline),
            actions: [
              IconButton(
                onPressed: () => openCart(context),
                icon: Badge(label: Text('${s.cartCount}'), isLabelVisible: s.cartCount > 0, child: const Icon(Icons.shopping_bag_outlined)),
              ),
            ],
          ),
          body: _tab == 0
              ? _home(s)
              : _tab == 1
                  ? _categories(s)
                  : _tab == 2
                      ? const CartScreen()
                      : const AccountScreen(),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'الرئيسية'),
              const NavigationDestination(icon: Icon(Icons.category_outlined), selectedIcon: Icon(Icons.category), label: 'الأقسام'),
              NavigationDestination(
                icon: Badge(label: Text('${s.cartCount}'), isLabelVisible: s.cartCount > 0, child: const Icon(Icons.shopping_cart_outlined)),
                label: 'السلة',
              ),
              const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'حسابي'),
            ],
          ),
        );
      },
    );
  }

  Widget _home(StoreSession s) {
    return RefreshIndicator(
      onRefresh: s.bootstrap,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StoreHero(
            palette: s.palette,
            eyebrow: 'مجموعة جديدة',
            title: s.store!.displayName,
            subtitle: 'تشكيلة أزياء وإكسسوارات مختارة بعناية لإطلالتك.',
            logoUrl: s.store!.logoUrl,
          ),
          const SizedBox(height: 16),
          StoreSearchBar(onSubmitted: s.setSearch),
          const SizedBox(height: 18),
          if (s.products.length > 2) ...[
            SectionHeader(title: 'وصل حديثًا', palette: s.palette),
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
          SectionHeader(title: 'الأكثر رواجًا', palette: s.palette),
          _productGrid(s),
        ],
      ),
    );
  }

  Widget _categories(StoreSession s) {
    if (s.categories.isEmpty) return const StoreEmptyState(message: 'لا توجد أقسام بعد.');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SectionHeader(title: 'تصفّح الأقسام', palette: s.palette),
        ...s.categories.map(
          (c) => Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(s.palette.cornerRadius)),
              leading: CircleAvatar(backgroundColor: s.palette.chipBackground, child: Text(c.nameAr.characters.first)),
              title: Text(c.nameAr, style: const TextStyle(fontWeight: FontWeight.w700)),
              trailing: Text('${c.productsCount}', style: TextStyle(color: s.palette.accent, fontWeight: FontWeight.bold)),
              onTap: () {
                s.selectCategory(c.slug);
                setState(() => _tab = 0);
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _productGrid(StoreSession s) {
    if (s.products.isEmpty) return const StoreEmptyState();
    return GridView.builder(
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
        onAdd: () => s.addToCart(s.products[i]),
        onTap: () => openProduct(context, s.products[i]),
      ),
    );
  }
}
