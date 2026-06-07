import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../state/store_session.dart';
import 'amber/amber_template.dart';
import 'emerald/emerald_template.dart';
import 'ocean/ocean_template.dart';
import 'rose/rose_template.dart';
import 'slate/slate_template.dart';
import 'violet/violet_template.dart';

/// Selects the native storefront shell compiled for this APK build.
Widget buildTemplateApp(StoreSession session) {
  switch (AppConfig.normalizedTheme) {
    case 'violet':
      return VioletTemplate(session: session);
    case 'emerald':
      return EmeraldTemplate(session: session);
    case 'amber':
      return AmberTemplate(session: session);
    case 'rose':
      return RoseTemplate(session: session);
    case 'slate':
      return SlateTemplate(session: session);
    case 'ocean':
    default:
      return OceanTemplate(session: session);
  }
}

String templateBuildLabel() {
  return AppConfig.normalizedTheme;
}
