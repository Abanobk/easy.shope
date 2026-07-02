import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/models.dart';

class StoreApiException implements Exception {
  StoreApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class StoreApi {
  StoreApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? _customerToken;

  void setCustomerToken(String? token) => _customerToken = token;

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = AppConfig.apiRoot.replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  /// GET with a request timeout and a couple of retries to survive transient
  /// network hiccups (slow mobile connections, brief drops).
  Future<http.Response> _getWithRetry(
    Uri uri, {
    Map<String, String>? headers,
    int attempts = 3,
    Duration timeout = const Duration(seconds: 40),
  }) async {
    Object? lastError;
    for (var attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await _client.get(uri, headers: headers).timeout(timeout);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await Future<void>.delayed(Duration(milliseconds: 400 * attempt));
        }
      }
    }
    throw StoreApiException(
      'تعذّر الاتصال بالخادم. تحقّق من الإنترنت وحاول مرة أخرى. ($lastError)',
    );
  }

  Future<Map<String, dynamic>> _decode(http.Response res) async {
    dynamic parsed;
    try {
      parsed = jsonDecode(res.body.isEmpty ? '{}' : res.body);
    } catch (_) {
      // Non-JSON response (e.g. a Cloudflare/gateway error page such as
      // "error code: 1033"). Surface a clear, user-friendly message instead of
      // a raw FormatException so the screen doesn't look broken.
      if (res.statusCode >= 500 || res.statusCode == 0) {
        throw StoreApiException('المتجر غير متاح مؤقتًا، يرجى المحاولة بعد قليل.', statusCode: res.statusCode);
      }
      if (res.statusCode >= 400) {
        throw StoreApiException('تعذّر تنفيذ الطلب (رمز ${res.statusCode}).', statusCode: res.statusCode);
      }
      throw StoreApiException('استجابة غير متوقعة من الخادم، حاول مرة أخرى لاحقًا.', statusCode: res.statusCode);
    }
    if (parsed is! Map<String, dynamic>) {
      throw StoreApiException('استجابة غير متوقعة من الخادم، حاول مرة أخرى لاحقًا.', statusCode: res.statusCode);
    }
    if (res.statusCode >= 400) {
      throw StoreApiException(parsed['message'] as String? ?? 'تعذّر تنفيذ الطلب (رمز ${res.statusCode}).', statusCode: res.statusCode);
    }
    return parsed;
  }

  Future<({StoreInfo store, List<CategoryInfo> categories, List<ProductInfo> featured})> fetchStore(
    String slug,
  ) async {
    final data = await _decode(await _getWithRetry(_uri('/store/$slug')));
    final store = StoreInfo.fromJson(data['store'] as Map<String, dynamic>);
    final categories = (data['categories'] as List<dynamic>? ?? [])
        .map((e) => CategoryInfo.fromJson(e as Map<String, dynamic>))
        .toList();
    final featured = (data['featuredProducts'] as List<dynamic>? ?? [])
        .map((e) => ProductInfo.fromJson(e as Map<String, dynamic>))
        .toList();
    return (store: store, categories: categories, featured: featured);
  }

  Future<List<ProductInfo>> fetchProducts(String slug, {String? query, String? categorySlug}) async {
    final q = <String, String>{};
    if (query != null && query.trim().isNotEmpty) q['q'] = query.trim();
    if (categorySlug != null && categorySlug.isNotEmpty) q['category'] = categorySlug;
    final data = await _decode(await _getWithRetry(_uri('/store/$slug/products', q.isEmpty ? null : q)));
    return (data['products'] as List<dynamic>? ?? [])
        .map((e) => ProductInfo.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ProductInfo> fetchProduct(String slug, String productSlug) async {
    final data = await _decode(await _getWithRetry(_uri('/store/$slug/products/$productSlug')));
    return ProductInfo.fromJson(data['product'] as Map<String, dynamic>);
  }

  Future<({String token, String name})> loginCustomer({
    required String email,
    required String password,
    required String expectedTenantId,
  }) async {
    final data = await _decode(
      await _client.post(
        _uri('/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email.trim().toLowerCase(), 'password': password}),
      ),
    );
    final user = data['user'] as Map<String, dynamic>? ?? {};
    if (user['role'] != 'customer') {
      throw StoreApiException('هذا الحساب ليس حساب عميل.');
    }
    if ('${user['tenantId']}' != expectedTenantId) {
      throw StoreApiException('هذا الحساب مرتبط بمتجر آخر.');
    }
    return (token: data['token'] as String, name: user['name'] as String? ?? '');
  }

  Future<({String token, String name})> registerCustomer({
    required String slug,
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    final data = await _decode(
      await _client.post(
        _uri('/store/$slug/customers/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'name': name, 'email': email, 'phone': phone, 'password': password}),
      ),
    );
    return (token: data['token'] as String, name: (data['user'] as Map?)?['name'] as String? ?? name);
  }

  Future<List<Map<String, dynamic>>> fetchCustomerOrders() async {
    if (_customerToken == null) throw StoreApiException('سجّل دخولك أولًا.');
    final data = await _decode(
      await _client.get(
        _uri('/customer/orders'),
        headers: {'Authorization': 'Bearer $_customerToken'},
      ),
    );
    return (data['orders'] as List<dynamic>? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<OrderResult> placeOrder({
    required String slug,
    required String customerName,
    required String customerPhone,
    String? customerEmail,
    String? shippingAddress,
    String? governorate,
    String? couponCode,
    String? paymentMethod,
    required List<CartLine> items,
  }) async {
    final payload = {
      'customerName': customerName,
      'customerPhone': customerPhone,
      if (customerEmail != null && customerEmail.isNotEmpty) 'customerEmail': customerEmail,
      if (shippingAddress != null && shippingAddress.isNotEmpty) 'shippingAddress': shippingAddress,
      if (governorate != null && governorate.isNotEmpty) 'governorate': governorate,
      if (couponCode != null && couponCode.isNotEmpty) 'couponCode': couponCode,
      if (paymentMethod != null && paymentMethod.isNotEmpty) 'paymentMethod': paymentMethod,
      'items': items.map((l) => {'productId': l.product.id, 'quantity': l.quantity}).toList(),
    };
    final data = await _decode(
      await _client.post(
        _uri('/store/$slug/orders'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ),
    );
    return OrderResult.fromJson(data);
  }
}
