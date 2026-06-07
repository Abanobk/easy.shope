class StoreInfo {
  StoreInfo({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    required this.slug,
    required this.country,
    required this.status,
    required this.storefrontTheme,
    this.brandColor,
    this.logoUrl,
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final String slug;
  final String country;
  final String status;
  final String storefrontTheme;
  final String? brandColor;
  final String? logoUrl;

  factory StoreInfo.fromJson(Map<String, dynamic> json) {
    return StoreInfo(
      id: json['id'] as String,
      nameAr: json['name_ar'] as String? ?? '',
      nameEn: json['name_en'] as String? ?? '',
      slug: json['slug'] as String,
      country: json['country'] as String? ?? '',
      status: json['status'] as String? ?? '',
      storefrontTheme: json['storefront_theme'] as String? ?? 'ocean',
      brandColor: json['brand_color'] as String?,
      logoUrl: json['logo_url'] as String?,
    );
  }

  String get displayName => nameAr.isNotEmpty ? nameAr : nameEn;
}

class CategoryInfo {
  CategoryInfo({
    required this.id,
    required this.nameAr,
    required this.slug,
    this.productsCount = 0,
  });

  final String id;
  final String nameAr;
  final String slug;
  final int productsCount;

  factory CategoryInfo.fromJson(Map<String, dynamic> json) {
    return CategoryInfo(
      id: json['id'] as String,
      nameAr: json['name_ar'] as String? ?? '',
      slug: json['slug'] as String,
      productsCount: json['products_count'] as int? ?? 0,
    );
  }
}

class ProductInfo {
  ProductInfo({
    required this.id,
    required this.titleAr,
    required this.titleEn,
    required this.slug,
    required this.priceCents,
    this.description,
    this.imageUrl,
    this.stockQuantity = 0,
  });

  final String id;
  final String titleAr;
  final String titleEn;
  final String slug;
  final int priceCents;
  final String? description;
  final String? imageUrl;
  final int stockQuantity;

  factory ProductInfo.fromJson(Map<String, dynamic> json) {
    return ProductInfo(
      id: json['id'] as String,
      titleAr: json['title_ar'] as String? ?? '',
      titleEn: json['title_en'] as String? ?? '',
      slug: json['slug'] as String,
      priceCents: json['price_cents'] as int? ?? 0,
      description: json['description'] as String?,
      imageUrl: json['image_url'] as String?,
      stockQuantity: json['stock_quantity'] as int? ?? 0,
    );
  }

  String get title => titleAr.isNotEmpty ? titleAr : titleEn;
  String get priceLabel => '${(priceCents / 100).toStringAsFixed(2)} EGP';
}

class CartLine {
  CartLine({required this.product, this.quantity = 1});

  final ProductInfo product;
  int quantity;

  int get lineTotalCents => product.priceCents * quantity;
}

class OrderResult {
  OrderResult({required this.orderId, required this.paymentStatus, this.checkoutUrl});

  final String orderId;
  final String paymentStatus;
  final String? checkoutUrl;

  factory OrderResult.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map<String, dynamic>? ?? {};
    final payment = json['payment'] as Map<String, dynamic>? ?? {};
    return OrderResult(
      orderId: order['id'] as String? ?? '',
      paymentStatus: payment['status'] as String? ?? 'pending',
      checkoutUrl: payment['checkoutUrl'] as String?,
    );
  }
}
