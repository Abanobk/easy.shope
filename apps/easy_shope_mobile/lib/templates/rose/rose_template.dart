import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Rose — منزل وديكور: معرض (carousel) للمميزات + شبكة منتجات.
class RoseTemplate extends StatefulWidget {
  const RoseTemplate({super.key, required this.session});

  final StoreSession session;

  @override
  State<RoseTemplate> createState() => _RoseTemplateState();
}

class _RoseTemplateState extends State<RoseTemplate> {
  final _controller = PageController(viewportFraction: 0.88);
  int _slide = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) {
        final s = widget.session;
        if (s.loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        if (s.error != null) return Scaffold(body: Center(child: Text(s.error!)));
        final featured = s.products.take(5).toList();
        return Scaffold(
          appBar: AppBar(
            title: StoreBrandTitle(store: s.store!, subtitle: s.palette.tagline),
            actions: [
              IconButton(onPressed: () => openAccount(context), icon: const Icon(Icons.person_outline)),
              IconButton(
                onPressed: () => openCart(context),
                icon: Badge(label: Text('${s.cartCount}'), isLabelVisible: s.cartCount > 0, child: const Icon(Icons.shopping_bag_outlined)),
              ),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: s.bootstrap,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              children: [
                if (featured.isNotEmpty) ...[
                  SectionHeader(title: 'مختارات مميزة', palette: s.palette),
                  _carousel(s, featured),
                  const SizedBox(height: 18),
                ] else ...[
                  StoreHero(
                    palette: s.palette,
                    eyebrow: 'لمسة أناقة',
                    title: s.store!.displayName,
                    subtitle: 'قطع ديكور ومنزل تضيف دفئًا لمساحتك.',
                    logoUrl: s.store!.logoUrl,
                  ),
                  const SizedBox(height: 16),
                ],
                StoreSearchBar(onSubmitted: s.setSearch),
                const SizedBox(height: 14),
                CategoryStrip(categories: s.categories, selected: s.selectedCategorySlug, onSelect: s.selectCategory, palette: s.palette),
                const SizedBox(height: 16),
                SectionHeader(title: 'كل القطع', palette: s.palette),
                if (s.products.isEmpty)
                  const StoreEmptyState()
                else
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 14,
                      mainAxisSpacing: 14,
                      childAspectRatio: 0.62,
                    ),
                    itemCount: s.products.length,
                    itemBuilder: (_, i) => ProductTile(
                      product: s.products[i],
                      palette: s.palette,
                      onAdd: () => s.addToCart(s.products[i]),
                      onTap: () => openProduct(context, s.products[i]),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _carousel(StoreSession s, List<ProductInfo> items) {
    return Column(
      children: [
        SizedBox(
          height: 190,
          child: PageView.builder(
            controller: _controller,
            itemCount: items.length,
            onPageChanged: (i) => setState(() => _slide = i),
            itemBuilder: (_, i) {
              final p = items[i];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: GestureDetector(
                  onTap: () => openProduct(context, p),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(s.palette.cornerRadius + 4),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (p.imageUrl != null && p.imageUrl!.isNotEmpty)
                          Image.network(p.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => _fallback(s))
                        else
                          _fallback(s),
                        const DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Colors.transparent, Colors.black87],
                            ),
                          ),
                        ),
                        Align(
                          alignment: Alignment.bottomRight,
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 17)),
                                const SizedBox(height: 4),
                                Text(p.priceLabel, style: TextStyle(color: s.palette.secondary, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            items.length,
            (i) => AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              width: i == _slide ? 22 : 8,
              height: 8,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                color: i == _slide ? s.palette.primary : s.palette.chipBackground,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _fallback(StoreSession s) {
    return Container(
      decoration: BoxDecoration(gradient: LinearGradient(colors: s.palette.heroGradient)),
    );
  }
}
