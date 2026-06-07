/// دعم العملاء — تواصل واتساب مع المنصة.
class SupportConfig {
  SupportConfig._();

  static const whatsAppDisplay = '01557827829';

  /// wa.me يستخدم E.164 بدون + (مصر: 20 + الرقم بدون صفر البداية).
  static const whatsAppWaMe = '201557827829';

  static Uri get whatsAppUri => Uri.parse(
        'https://wa.me/$whatsAppWaMe?text=${Uri.encodeComponent('مرحبًا، أود الاستفسار عن المتجر')}',
      );
}
