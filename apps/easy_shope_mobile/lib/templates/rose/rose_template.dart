import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../screens/store_screens.dart';
import '../../state/store_session.dart';
import '../../widgets/store_widgets.dart';

/// Rose — منزل وديكور: معرض (carousel) + شبكة.
class RoseTemplate extends StatefulWidget {
  const RoseTemplate({super.key, required this.session});

  final StoreSession session;

  @override
  State<RoseTemplate> createState() => _RoseTemplateState();
}

class _RoseTemplateState extends State<RoseTemplate> {
  int _slide = 0;

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
            title: Text(s.store!.displayName),
            actions: [
              IconButton(onPressed: () => openCart(context), icon: Badge(label: Text('${s.cartCount}'), child: const Icon(Icons.shopping_bag_outlined))),
              IconButton(onPressed: () => openAccount(context), icon: const Icon(Icons.person_outline)),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (featured.isNotEmpty) _carousel(s, featured),
              const SizedBox(height: 12),
              CategoryStrip(categories: s.categories, selected: s.selectedCategorySlug, onSelect: s.selectCategory, palette: s.palette),
              const SizedBox(height: 12),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, crossAxisSpacing: 12, mainAxisSpacing: 12, childAspectRatio: 0.65),
                itemCount: s.products.length,
                itemBuilder: (_, i) {
                  final p = s.products[i];
                  return ProductTile(product: p, palette: s.palette, onAdd: () => s.addToCart(p), onTap: () => openProduct(context, p));
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _carousel(StoreSession s, List<ProductInfo> items) {
    return Column(
      children: [
        SizedBox(
          height: 180,
          child: PageView.builder(
            itemCount: items.length,
            onPageChanged: (i) => setState(() => _slide = i),
            itemBuilder: (_, i) {
              final p = items[i];
              return GestureDetector(
                onTap: () => openProduct(context, p),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (p.imageUrl != null)
                        Image.network(p.imageUrl!, fit: BoxFit.cover)
                      else
                        Container(color: s.palette.surface),
                      Align(
                        alignment: Alignment.bottomLeft,
                        child: Container(
                          width: double.infinity,
                          color: Colors.black54,
                          padding: const EdgeInsets.all(12),
                          child: Text(p.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(items.length, (i) => Container(width: 8, height: 8, margin: const EdgeInsets.symmetric(horizontal: 3), decoration: BoxDecoration(shape: BoxShape.circle, color: i == _slide ? s.palette.primary : s.palette.chipBackground))),
        ),
      ],
    );
  }
}
