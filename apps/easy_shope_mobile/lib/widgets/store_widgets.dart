import 'dart:convert';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme/template_palette.dart';

enum ProductLayoutStyle { grid, list, card, minimal }

class ProductTile extends StatelessWidget {
  const ProductTile({
    super.key,
    required this.product,
    required this.palette,
    required this.onAdd,
    required this.onTap,
    this.style = ProductLayoutStyle.grid,
    this.addLabel = 'أضف للسلة',
  });

  final ProductInfo product;
  final TemplatePalette palette;
  final VoidCallback onAdd;
  final VoidCallback onTap;
  final ProductLayoutStyle style;
  final String addLabel;

  @override
  Widget build(BuildContext context) {
    return switch (style) {
      ProductLayoutStyle.list => _ListTile(),
      ProductLayoutStyle.minimal => _MinimalTile(),
      ProductLayoutStyle.card || ProductLayoutStyle.grid => _GridCard(),
    };
  }

  Widget _image(double height) {
    if (product.imageUrl != null && product.imageUrl!.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Image.network(product.imageUrl!, height: height, width: double.infinity, fit: BoxFit.cover),
      );
    }
    return Container(
      height: height,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(colors: [palette.primary.withValues(alpha: 0.35), palette.surface]),
      ),
      child: Text(product.title.characters.first, style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold, color: palette.accent)),
    );
  }

  Widget _GridCard() {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _image(120),
              const SizedBox(height: 10),
              Text(product.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(product.priceLabel, style: TextStyle(color: palette.accent, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              FilledButton(onPressed: onAdd, child: Text(addLabel)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _ListTile() {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              SizedBox(width: 88, child: _image(88)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(product.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(product.priceLabel, style: TextStyle(color: palette.accent)),
                  ],
                ),
              ),
              IconButton(onPressed: onAdd, icon: Icon(Icons.add_shopping_cart, color: palette.primary)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _MinimalTile() {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      title: Text(product.title),
      subtitle: Text(product.priceLabel),
      trailing: IconButton(onPressed: onAdd, icon: const Icon(Icons.add)),
    );
  }
}

class CategoryStrip extends StatelessWidget {
  const CategoryStrip({super.key, required this.categories, required this.selected, required this.onSelect, required this.palette});

  final List<CategoryInfo> categories;
  final String? selected;
  final ValueChanged<String?> onSelect;
  final TemplatePalette palette;

  @override
  Widget build(BuildContext context) {
    if (categories.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _chip('الكل', selected == null, () => onSelect(null)),
          ...categories.map((c) => _chip(c.nameAr, selected == c.slug, () => onSelect(c.slug))),
        ],
      ),
    );
  }

  Widget _chip(String label, bool active, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: FilterChip(
        label: Text(label),
        selected: active,
        onSelected: (_) => onTap(),
        backgroundColor: palette.chipBackground,
        selectedColor: palette.primary,
        labelStyle: TextStyle(color: active ? Colors.white : palette.onSurface),
      ),
    );
  }
}

class StoreSearchBar extends StatelessWidget {
  const StoreSearchBar({super.key, required this.onSubmitted, this.hint = 'ابحث عن منتج'});

  final ValueChanged<String> onSubmitted;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return TextField(
      decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: hint),
      onSubmitted: onSubmitted,
      textInputAction: TextInputAction.search,
    );
  }
}

class StoreLogoImage extends StatelessWidget {
  const StoreLogoImage({super.key, required this.logoUrl, this.size = 36, this.radius = 8});

  final String? logoUrl;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final url = logoUrl?.trim();
    if (url == null || url.isEmpty) return const SizedBox.shrink();

    Widget image;
    if (url.startsWith('data:image')) {
      try {
        final bytes = base64Decode(url.split(',').last);
        image = Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true);
      } catch (_) {
        return const SizedBox.shrink();
      }
    } else {
      image = Image.network(
        url,
        fit: BoxFit.cover,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(width: size, height: size, child: image),
    );
  }
}

class StoreBrandTitle extends StatelessWidget {
  const StoreBrandTitle({super.key, required this.store, this.subtitle});

  final StoreInfo store;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final hasLogo = store.logoUrl != null && store.logoUrl!.trim().isNotEmpty;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (hasLogo) ...[
          StoreLogoImage(logoUrl: store.logoUrl),
          const SizedBox(width: 10),
        ],
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(store.displayName, overflow: TextOverflow.ellipsis),
              if (subtitle != null) Text(subtitle!, style: Theme.of(context).textTheme.labelSmall),
            ],
          ),
        ),
      ],
    );
  }
}
