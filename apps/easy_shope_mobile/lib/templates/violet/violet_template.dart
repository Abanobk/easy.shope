import 'package:flutter/material.dart';

import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Violet — تجميل: hero + قصص (stories) دائرية + بطاقات عمودية.
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
            title: StoreBrandTitle(store: s.store!, subtitle: s.palette.tagline),
            actions: [
              IconButton(onPressed: () => openAccount(context), icon: const Icon(Icons.person_outline)),
              IconButton(
                onPressed: () => openCart(context),
                icon: Badge(label: Text('${s.cartCount}'), isLabelVisible: s.cartCount > 0, child: const Icon(Icons.shopping_bag)),
              ),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: s.bootstrap,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                StoreHero(
                  palette: s.palette,
                  eyebrow: 'جمالك يبدأ هنا',
                  title: s.store!.displayName,
                  subtitle: 'منتجات تجميل وعناية أصلية بأفضل الأسعار.',
                  logoUrl: s.store!.logoUrl,
                  height: 150,
                ),
                const SizedBox(height: 16),
                if (s.categories.isNotEmpty) ...[
                  SectionHeader(title: 'تسوّقي حسب الفئة', palette: s.palette),
                  _stories(s),
                  const SizedBox(height: 16),
                ],
                StoreSearchBar(onSubmitted: s.setSearch, hint: 'ابحثي عن منتج'),
                const SizedBox(height: 16),
                if (s.products.isNotEmpty) ...[
                  SectionHeader(title: 'منتج العناية المميز', palette: s.palette),
                  SpotlightCard(
                    product: s.products.first,
                    palette: s.palette,
                    label: 'الأكثر مبيعًا',
                    addLabel: 'أضيفي للسلة',
                    onTap: () => openProduct(context, s.products.first),
                    onAdd: () => s.addToCart(s.products.first),
                  ),
                  const SizedBox(height: 18),
                ],
                SectionHeader(title: 'وصل حديثًا', palette: s.palette),
                if (s.products.isEmpty)
                  const StoreEmptyState()
                else
                  ...s.products.map(
                    (p) => Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: ProductTile(
                        product: p,
                        palette: s.palette,
                        style: ProductLayoutStyle.list,
                        addLabel: 'أضيفي للسلة',
                        onAdd: () => s.addToCart(p),
                        onTap: () => openProduct(context, p),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _stories(StoreSession s) {
    return SizedBox(
      height: 100,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: s.categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (_, i) {
          final c = s.categories[i];
          final active = s.selectedCategorySlug == c.slug;
          return GestureDetector(
            onTap: () => s.selectCategory(active ? null : c.slug),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: active ? LinearGradient(colors: s.palette.heroGradient) : null,
                    border: active ? null : Border.all(color: s.palette.hairline, width: 2),
                  ),
                  child: CircleAvatar(
                    radius: 30,
                    backgroundColor: s.palette.chipBackground,
                    child: Text(c.nameAr.characters.first, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  width: 70,
                  child: Text(c.nameAr, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
