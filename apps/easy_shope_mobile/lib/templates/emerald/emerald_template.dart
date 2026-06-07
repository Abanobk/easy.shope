import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Emerald — إلكترونيات: قائمة أفقية + شريط سفلي.
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
            title: StoreBrandTitle(store: s.store!),
            actions: [Chip(label: const Text('Tech hub'), backgroundColor: s.palette.chipBackground)],
          ),
          body: _tab == 0
              ? ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    StoreSearchBar(onSubmitted: s.setSearch),
                    const SizedBox(height: 12),
                    CategoryStrip(categories: s.categories, selected: s.selectedCategorySlug, onSelect: s.selectCategory, palette: s.palette),
                    const SizedBox(height: 8),
                    ...s.products.map(
                      (p) => ProductTile(
                        product: p,
                        palette: s.palette,
                        style: ProductLayoutStyle.list,
                        onAdd: () => s.addToCart(p),
                        onTap: () => openProduct(context, p),
                      ),
                    ),
                  ],
                )
              : _tab == 1
                  ? const CartScreen()
                  : const AccountScreen(),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.devices), label: 'المنتجات'),
              NavigationDestination(icon: Icon(Icons.shopping_cart), label: 'السلة'),
              NavigationDestination(icon: Icon(Icons.account_circle), label: 'حسابي'),
            ],
          ),
        );
      },
    );
  }
}
