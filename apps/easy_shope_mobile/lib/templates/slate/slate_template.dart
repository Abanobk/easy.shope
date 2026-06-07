import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Slate — إبداعي minimal: قائمة بسيطة بدون زخرفة.
class SlateTemplate extends StatelessWidget {
  const SlateTemplate({super.key, required this.session});

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
            title: Text(s.store!.displayName),
            actions: [
              TextButton(onPressed: () => openCart(context), child: Text('السلة (${s.cartCount})')),
              IconButton(onPressed: () => openAccount(context), icon: const Icon(Icons.person_outline)),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            children: [
              Text('منتجات مختارة', style: Theme.of(context).textTheme.titleMedium?.copyWith(letterSpacing: 1.2)),
              const SizedBox(height: 8),
              StoreSearchBar(onSubmitted: s.setSearch),
              const SizedBox(height: 8),
              CategoryStrip(categories: s.categories, selected: s.selectedCategorySlug, onSelect: s.selectCategory, palette: s.palette),
              const Divider(height: 24),
              ...s.products.map(
                (p) => ProductTile(
                  product: p,
                  palette: s.palette,
                  style: ProductLayoutStyle.minimal,
                  onAdd: () => s.addToCart(p),
                  onTap: () => openProduct(context, p),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
