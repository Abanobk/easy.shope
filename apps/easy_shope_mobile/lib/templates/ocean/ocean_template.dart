import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Ocean — أزياء: شبكة منتجات + شريط سفلي + تبويبات أقسام.
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
            title: StoreBrandTitle(store: store, subtitle: 'أزياء وإكسسوارات'),
            actions: [
              IconButton(onPressed: () => openCart(context), icon: Badge(label: Text('${s.cartCount}'), child: const Icon(Icons.shopping_bag_outlined))),
            ],
          ),
          body: _tab == 0 ? _home(s) : _tab == 1 ? _categories(s) : _tab == 2 ? const CartScreen() : const AccountScreen(),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.home_outlined), label: 'الرئيسية'),
              NavigationDestination(icon: Icon(Icons.category_outlined), label: 'الأقسام'),
              NavigationDestination(icon: Icon(Icons.shopping_cart_outlined), label: 'السلة'),
              NavigationDestination(icon: Icon(Icons.person_outline), label: 'حسابي'),
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
          StoreSearchBar(onSubmitted: s.setSearch),
          const SizedBox(height: 12),
          CategoryStrip(categories: s.categories, selected: s.selectedCategorySlug, onSelect: s.selectCategory, palette: s.palette),
          const SizedBox(height: 12),
          _productGrid(s),
        ],
      ),
    );
  }

  Widget _categories(StoreSession s) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: s.categories
          .map(
            (c) => ListTile(
              title: Text(c.nameAr),
              trailing: Text('${c.productsCount}'),
              onTap: () {
                s.selectCategory(c.slug);
                setState(() => _tab = 0);
              },
            ),
          )
          .toList(),
    );
  }

  Widget _productGrid(StoreSession s) {
    if (s.products.isEmpty) return const Text('لا توجد منتجات منشورة.');
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.62),
      itemCount: s.products.length,
      itemBuilder: (_, i) => _tile(s, s.products[i]),
    );
  }

  Widget _tile(StoreSession s, ProductInfo p) {
    return ProductTile(
      product: p,
      palette: s.palette,
      onAdd: () => s.addToCart(p),
      onTap: () => openProduct(context, p),
    );
  }
}
