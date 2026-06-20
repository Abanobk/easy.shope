import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/support_config.dart';

/// زر واتساب ثابت للعميل — استفسارات على مدار الساعة.
class WhatsAppSupportButton extends StatelessWidget {
  const WhatsAppSupportButton({super.key});

  Future<void> _openWhatsApp(BuildContext context) async {
    final uri = SupportConfig.whatsAppUri;
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذر فتح واتساب. تأكد أن التطبيق مثبت على جهازك.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).padding.bottom;
    // Lift above a possible bottom navigation bar (~66px) so it never covers
    // the storefront tabs (home/categories/cart/account).
    return Positioned(
      left: 16,
      bottom: 84 + bottom,
      child: Material(
        elevation: 6,
        shadowColor: const Color(0xFF25D366).withValues(alpha: 0.5),
        shape: const CircleBorder(),
        color: const Color(0xFF25D366),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => _openWhatsApp(context),
          child: const Padding(
            padding: EdgeInsets.all(14),
            child: Icon(Icons.chat, color: Colors.white, size: 26),
          ),
        ),
      ),
    );
  }
}
