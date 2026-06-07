import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Violet — تجميل: قصص (stories) + بطاقات عمودية.
class VioletTemplate extends StatelessWidget {
  const VioletTemplate({super.key, required this.session});

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
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.store!.displayName),
                const Text('تجميل وعناية', style: TextStyle(fontSize: 12)),
              ],
            ),
            actions: [
              IconButton(onPressed: () => openAccount(context), icon: const Icon(Icons.person_outline)),
              IconButton(onPressed: () => openCart(context), icon: Badge(label: Text('${s.cartCount}'), child: const Icon(Icons.shopping_bag))),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: s.bootstrap,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _stories(s),
                const SizedBox(height: 12),
                StoreSearchBar(onSubmitted: s.setSearch),
                const SizedBox(height: 12),
                ...s.products.map((p) => ProductTile(product: p, palette: s.palette, style: ProductLayoutStyle.card, onAdd: () => s.addToCart(p), onTap: () => openProduct(context, p))),
                if (s.products.isEmpty) const Text('لا توجد منتجات.'),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _stories(StoreSession s) {
    if (s.categories.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: s.categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final c = s.categories[i];
          final active = s.selectedCategorySlug == c.slug;
          return GestureDetector(
            onTap: () => s.selectCategory(c.slug),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: active ? s.palette.primary : s.palette.chipBackground,
                  child: Text(c.nameAr.characters.first, style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 6),
                SizedBox(width: 64, child: Text(c.nameAr, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11))),
              ],
            ),
          );
        },
      ),
    );
  }
}
