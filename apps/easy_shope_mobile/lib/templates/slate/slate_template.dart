import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Slate — إبداعي minimal: عنوان كبير هادئ + قائمة بسيطة مع فواصل.
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
            title: StoreBrandTitle(store: s.store!),
            actions: [
              TextButton(onPressed: () => openCart(context), child: Text('السلة (${s.cartCount})')),
              IconButton(onPressed: () => openAccount(context), icon: const Icon(Icons.person_outline)),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: s.bootstrap,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
              children: [
                Text(
                  s.palette.tagline.toUpperCase(),
                  style: TextStyle(color: s.palette.muted, letterSpacing: 3, fontSize: 12, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  s.store!.displayName,
                  style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, height: 1.1),
                ),
                const SizedBox(height: 18),
                StoreSearchBar(onSubmitted: s.setSearch),
                const SizedBox(height: 14),
                CategoryStrip(categories: s.categories, selected: s.selectedCategorySlug, onSelect: s.selectCategory, palette: s.palette),
                const SizedBox(height: 8),
                const Divider(height: 32),
                if (s.products.isEmpty)
                  const StoreEmptyState()
                else
                  ...List.generate(s.products.length, (i) {
                    final p = s.products[i];
                    return Column(
                      children: [
                        ProductTile(
                          product: p,
                          palette: s.palette,
                          style: ProductLayoutStyle.minimal,
                          onAdd: () => s.addToCart(p),
                          onTap: () => openProduct(context, p),
                        ),
                        if (i != s.products.length - 1) Divider(height: 18, color: s.palette.hairline),
                      ],
                    );
                  }),
              ],
            ),
          ),
        );
      },
    );
  }
}
