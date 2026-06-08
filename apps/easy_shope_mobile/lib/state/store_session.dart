import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../models/models.dart';
import '../services/store_api.dart';
import '../theme/template_palette.dart';

/// Global store session: API, cart, selected category, search.
class StoreSession extends ChangeNotifier {
  StoreSession({StoreApi? api}) : api = api ?? StoreApi();

  final StoreApi api;

  StoreInfo? store;
  List<CategoryInfo> categories = [];
  List<ProductInfo> products = [];
  String? selectedCategorySlug;
  String searchQuery = '';
  bool loading = true;
  String? error;
  String? customerToken;
  String? customerName;

  final List<CartLine> cart = [];

  bool _guestBrowsing = false;

  /// Theme from live store settings (API), then compile-time fallback from APK build.
  String get activeTheme {
    final fromStore = store?.storefrontTheme.trim().toLowerCase();
    if (fromStore != null && fromStore.isNotEmpty && AppConfig.supportedThemes.contains(fromStore)) {
      return fromStore;
    }
    return AppConfig.normalizedTheme;
  }

  bool get showEntryGate => customerToken == null && !_guestBrowsing;

  TemplatePalette get palette => TemplatePalette.forTheme(activeTheme);

  int get cartCount => cart.fold(0, (sum, line) => sum + line.quantity);
  int get cartTotalCents => cart.fold(0, (sum, line) => sum + line.lineTotalCents);

  Future<void> bootstrap() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final slug = AppConfig.tenantSlug.trim();
      final bundle = await api.fetchStore(slug);
      store = bundle.store;
      categories = bundle.categories;
      products = await api.fetchProducts(slug);
    } catch (e) {
      error = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> reloadProducts() async {
    if (store == null) return;
    try {
      products = await api.fetchProducts(
        store!.slug,
        query: searchQuery,
        categorySlug: selectedCategorySlug,
      );
      notifyListeners();
    } catch (e) {
      error = e.toString();
      notifyListeners();
    }
  }

  void selectCategory(String? slug) {
    selectedCategorySlug = slug;
    reloadProducts();
  }

  void setSearch(String value) {
    searchQuery = value;
    reloadProducts();
  }

  void addToCart(ProductInfo product) {
    final existing = cart.where((l) => l.product.id == product.id).firstOrNull;
    if (existing != null) {
      existing.quantity++;
    } else {
      cart.add(CartLine(product: product));
    }
    notifyListeners();
  }

  void decrementCartLine(String productId) {
    final existing = cart.where((l) => l.product.id == productId).firstOrNull;
    if (existing == null) return;
    if (existing.quantity > 1) {
      existing.quantity--;
    } else {
      cart.removeWhere((l) => l.product.id == productId);
    }
    notifyListeners();
  }

  void removeFromCart(String productId) {
    cart.removeWhere((l) => l.product.id == productId);
    notifyListeners();
  }

  void clearCart() {
    cart.clear();
    notifyListeners();
  }

  Future<OrderResult> checkout({
    required String name,
    required String phone,
    String? email,
    String? address,
  }) async {
    if (store == null || cart.isEmpty) {
      throw StoreApiException('السلة فارغة.');
    }
    final result = await api.placeOrder(
      slug: store!.slug,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      shippingAddress: address,
      items: cart,
    );
    clearCart();
    return result;
  }

  Future<void> login(String email, String password) async {
    if (store == null) throw StoreApiException('المتجر غير جاهز.');
    final res = await api.loginCustomer(
      email: email,
      password: password,
      expectedTenantId: store!.id,
    );
    customerToken = res.token;
    customerName = res.name;
    api.setCustomerToken(res.token);
    notifyListeners();
  }

  Future<void> register({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    if (store == null) throw StoreApiException('المتجر غير جاهز.');
    final res = await api.registerCustomer(
      slug: store!.slug,
      name: name,
      email: email,
      phone: phone,
      password: password,
    );
    customerToken = res.token;
    customerName = res.name;
    api.setCustomerToken(res.token);
    notifyListeners();
  }

  void logoutCustomer() {
    customerToken = null;
    customerName = null;
    _guestBrowsing = false;
    api.setCustomerToken(null);
    notifyListeners();
  }

  void continueAsGuest() {
    _guestBrowsing = true;
    notifyListeners();
  }
}

class StoreScope extends InheritedNotifier<StoreSession> {
  const StoreScope({super.key, required super.notifier, required super.child});

  static StoreSession of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<StoreScope>();
    assert(scope != null, 'StoreScope not found');
    return scope!.notifier!;
  }
}
