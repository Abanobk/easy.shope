import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:easy_shope_mobile/main.dart';

void main() {
  testWidgets('App builds', (WidgetTester tester) async {
    await tester.pumpWidget(const EasyShopeMobileApp());
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
