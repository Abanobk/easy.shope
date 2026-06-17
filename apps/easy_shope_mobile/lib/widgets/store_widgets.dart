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

  bool get _outOfStock => product.stockQuantity <= 0;
  bool get _lowStock => product.stockQuantity > 0 && product.stockQuantity <= 5;

  @override
  Widget build(BuildContext context) {
    return switch (style) {
      ProductLayoutStyle.list => _listTile(),
      ProductLayoutStyle.minimal => _minimalTile(),
      ProductLayoutStyle.card || ProductLayoutStyle.grid => _gridCard(),
    };
  }

  Widget _image(double height, {bool rounded = true}) {
    Widget child;
    if (product.imageUrl != null && product.imageUrl!.isNotEmpty) {
      child = Image.network(
        product.imageUrl!,
        height: height,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _placeholder(height),
      );
    } else {
      child = _placeholder(height);
    }
    if (!rounded) return SizedBox(height: height, width: double.infinity, child: child);
    return ClipRRect(borderRadius: BorderRadius.circular(palette.cornerRadius - 4), child: child);
  }

  Widget _placeholder(double height) {
    return Container(
      height: height,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [palette.primary.withValues(alpha: 0.35), palette.surface],
        ),
      ),
      child: Text(
        product.title.characters.isEmpty ? '?' : product.title.characters.first,
        style: TextStyle(fontSize: 34, fontWeight: FontWeight.bold, color: palette.accent),
      ),
    );
  }

  Widget _stockBadge() {
    if (_outOfStock) return _badge('غير متوفر', Colors.black.withValues(alpha: 0.72), Colors.white);
    if (_lowStock) return _badge('متبقي ${product.stockQuantity}', palette.primary, Colors.white);
    return const SizedBox.shrink();
  }

  Widget _badge(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800)),
    );
  }

  Widget _addButton() {
    return Material(
      elevation: _outOfStock ? 0 : 3,
      shadowColor: palette.primary.withValues(alpha: 0.5),
      color: _outOfStock ? palette.chipBackground : palette.primary,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: _outOfStock ? null : onAdd,
        child: Padding(
          padding: const EdgeInsets.all(9),
          child: Icon(Icons.add_rounded, color: _outOfStock ? palette.muted : Colors.white, size: 20),
        ),
      ),
    );
  }

  Widget _gridCard() {
    return Card(
      elevation: 8,
      shadowColor: palette.primary.withValues(alpha: 0.28),
      surfaceTintColor: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Stack(
              children: [
                _image(140, rounded: false),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black.withValues(alpha: 0.30)],
                        stops: const [0.55, 1.0],
                      ),
                    ),
                  ),
                ),
                Positioned(top: 10, right: 10, child: _stockBadge()),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700, height: 1.3),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          product.priceLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: palette.accent, fontWeight: FontWeight.w900, fontSize: 15),
                        ),
                      ),
                      _addButton(),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _listTile() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        elevation: 5,
        shadowColor: palette.primary.withValues(alpha: 0.20),
        surfaceTintColor: Colors.transparent,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(palette.cornerRadius - 6),
                  child: SizedBox(width: 92, height: 92, child: _image(92, rounded: false)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(product.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      if (_outOfStock || _lowStock) ...[_stockBadge(), const SizedBox(height: 6)],
                      Row(
                        children: [
                          Expanded(
                            child: Text(product.priceLabel, style: TextStyle(color: palette.accent, fontWeight: FontWeight.w900, fontSize: 15)),
                          ),
                          _addButton(),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _minimalTile() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(product.priceLabel, style: TextStyle(color: palette.muted, fontSize: 13)),
              ],
            ),
          ),
          TextButton(
            onPressed: _outOfStock ? null : onAdd,
            child: Text(_outOfStock ? 'غير متوفر' : addLabel),
          ),
        ],
      ),
    );
  }
}

/// Horizontal showcase of featured products with premium overlay cards.
/// Uses an [Expanded] image so the card never overflows its fixed height.
class FeaturedRail extends StatelessWidget {
  const FeaturedRail({
    super.key,
    required this.products,
    required this.palette,
    required this.onTap,
    required this.onAdd,
    this.height = 232,
    this.cardWidth = 168,
  });

  final List<ProductInfo> products;
  final TemplatePalette palette;
  final void Function(ProductInfo) onTap;
  final void Function(ProductInfo) onAdd;
  final double height;
  final double cardWidth;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.zero,
        clipBehavior: Clip.none,
        itemCount: products.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final p = products[i];
          return SizedBox(
            width: cardWidth,
            child: _FeaturedCard(
              product: p,
              palette: palette,
              onTap: () => onTap(p),
              onAdd: () => onAdd(p),
            ),
          );
        },
      ),
    );
  }
}

class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({
    required this.product,
    required this.palette,
    required this.onTap,
    required this.onAdd,
  });

  final ProductInfo product;
  final TemplatePalette palette;
  final VoidCallback onTap;
  final VoidCallback onAdd;

  bool get _outOfStock => product.stockQuantity <= 0;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 8,
      shadowColor: palette.primary.withValues(alpha: 0.28),
      surfaceTintColor: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _image(),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black54],
                        stops: [0.5, 1.0],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          product.priceLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: palette.accent, fontWeight: FontWeight.w900, fontSize: 14),
                        ),
                      ),
                      Material(
                        color: _outOfStock ? palette.chipBackground : palette.primary,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _outOfStock ? null : onAdd,
                          child: Padding(
                            padding: const EdgeInsets.all(6),
                            child: Icon(Icons.add_rounded, size: 18, color: _outOfStock ? palette.muted : Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _image() {
    if (product.imageUrl != null && product.imageUrl!.isNotEmpty) {
      return Image.network(product.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => _placeholder());
    }
    return _placeholder();
  }

  Widget _placeholder() {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [palette.primary.withValues(alpha: 0.35), palette.surface],
        ),
      ),
      child: Text(
        product.title.characters.isEmpty ? '?' : product.title.characters.first,
        style: TextStyle(fontSize: 30, fontWeight: FontWeight.bold, color: palette.accent),
      ),
    );
  }
}

/// Large editorial highlight card for a single featured product.
/// All heights are intrinsic (image on top), so it never overflows.
class SpotlightCard extends StatelessWidget {
  const SpotlightCard({
    super.key,
    required this.product,
    required this.palette,
    required this.onTap,
    required this.onAdd,
    this.label = 'منتج مميز',
    this.addLabel = 'أضف للسلة',
    this.imageHeight = 196,
  });

  final ProductInfo product;
  final TemplatePalette palette;
  final VoidCallback onTap;
  final VoidCallback onAdd;
  final String label;
  final String addLabel;
  final double imageHeight;

  bool get _outOfStock => product.stockQuantity <= 0;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 12,
      shadowColor: palette.primary.withValues(alpha: 0.35),
      surfaceTintColor: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: imageHeight,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _image(),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black87],
                        stops: [0.45, 1.0],
                      ),
                    ),
                  ),
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: palette.primary,
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: palette.cardShadow,
                      ),
                      child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                    ),
                  ),
                  Positioned(
                    left: 16,
                    right: 16,
                    bottom: 14,
                    child: Text(
                      product.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20, height: 1.2),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(product.priceLabel, style: TextStyle(color: palette.accent, fontWeight: FontWeight.w900, fontSize: 18)),
                        if (product.description?.trim().isNotEmpty == true) ...[
                          const SizedBox(height: 4),
                          Text(
                            product.description!.trim(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: palette.muted, fontSize: 12.5, height: 1.4),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    onPressed: _outOfStock ? null : onAdd,
                    child: Text(_outOfStock ? 'غير متوفر' : addLabel),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _image() {
    if (product.imageUrl != null && product.imageUrl!.isNotEmpty) {
      return Image.network(product.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => _placeholder());
    }
    return _placeholder();
  }

  Widget _placeholder() {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(gradient: LinearGradient(colors: palette.heroGradient)),
      child: Text(
        product.title.characters.isEmpty ? '?' : product.title.characters.first,
        style: const TextStyle(fontSize: 56, fontWeight: FontWeight.bold, color: Colors.white),
      ),
    );
  }
}

/// Gradient hero banner used across templates with store identity + tagline.
class StoreHero extends StatelessWidget {
  const StoreHero({
    super.key,
    required this.palette,
    required this.title,
    this.subtitle,
    this.eyebrow,
    this.height = 158,
    this.logoUrl,
  });

  final TemplatePalette palette;
  final String title;
  final String? subtitle;
  final String? eyebrow;
  final double height;
  final String? logoUrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(palette.cornerRadius + 4),
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: palette.heroGradient,
        ),
        boxShadow: palette.heroShadow,
      ),
      child: Stack(
        children: [
          Positioned(
            top: -40,
            left: -30,
            child: _circle(140, Colors.white.withValues(alpha: 0.12)),
          ),
          Positioned(
            bottom: -50,
            right: -20,
            child: _circle(120, Colors.white.withValues(alpha: 0.08)),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (logoUrl != null && logoUrl!.trim().isNotEmpty) ...[
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: StoreLogoImage(logoUrl: logoUrl, size: 40, radius: 10),
                  ),
                  const SizedBox(height: 12),
                ],
                if (eyebrow != null)
                  Text(
                    eyebrow!,
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontWeight: FontWeight.w700, fontSize: 12, letterSpacing: 0.4),
                  ),
                const SizedBox(height: 4),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 24),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    subtitle!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13.5, height: 1.4),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _circle(double size, Color color) {
    return Container(width: size, height: size, decoration: BoxDecoration(shape: BoxShape.circle, color: color));
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, this.palette, this.actionLabel, this.onAction});

  final String title;
  final TemplatePalette? palette;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final accent = palette?.accent ?? Theme.of(context).colorScheme.tertiary;
    final primary = palette?.primary ?? Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Container(
            width: 5,
            height: 20,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [accent, primary],
              ),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17))),
          if (actionLabel != null)
            TextButton(onPressed: onAction, child: Text(actionLabel!)),
        ],
      ),
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
      height: 42,
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
      child: Material(
        color: active ? palette.primary : palette.chipBackground,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            child: Text(
              label,
              style: TextStyle(
                color: active ? Colors.white : palette.onSurface,
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
            ),
          ),
        ),
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
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.search),
        hintText: hint,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide.none),
      ),
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

/// Empty state used when a category/search returns no products.
class StoreEmptyState extends StatelessWidget {
  const StoreEmptyState({super.key, this.message = 'لا توجد منتجات لعرضها حاليًا.'});

  final String message;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          Icon(Icons.inventory_2_outlined, size: 48, color: color),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
