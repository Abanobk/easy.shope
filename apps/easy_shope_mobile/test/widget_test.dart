import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:easy_shope_mobile/config/app_config.dart';
import 'package:easy_shope_mobile/main.dart';

void main() {
  testWidgets('App builds with default compile-time config', (WidgetTester tester) async {
    await tester.pumpWidget(const EasyShopeMobileApp());
    expect(find.byType(MaterialApp), findsOneWidget);
  });

  test('supported themes include all storefront codes', () {
    expect(AppConfig.supportedThemes, contains('ocean'));
    expect(AppConfig.supportedThemes.length, 6);
  });
}
