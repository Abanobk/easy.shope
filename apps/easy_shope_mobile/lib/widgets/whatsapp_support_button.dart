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
    return Positioned(
      left: 16,
      bottom: 16 + bottom,
      child: Material(
        elevation: 6,
        shadowColor: const Color(0xFF25D366).withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(28),
        color: const Color(0xFF25D366),
        child: InkWell(
          onTap: () => _openWhatsApp(context),
          borderRadius: BorderRadius.circular(28),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.chat, color: Colors.white, size: 22),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('واتساب', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text(
                      SupportConfig.whatsAppDisplay,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
