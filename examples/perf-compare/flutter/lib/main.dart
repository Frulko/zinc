// perf-compare, Flutter twin. PC_DEMO=hello | list | anim | input (environment).
// list: 1000 rows auto-scrolled 40 px per frame, anim: a counter + bar updated every frame, input: one char per frame.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

final mode = Platform.environment['PC_DEMO'] ?? 'hello';

void main() => runApp(MaterialApp(debugShowCheckedModeBanner: false, home: const Demo()));

class Demo extends StatefulWidget {
  const Demo({super.key});
  @override
  State<Demo> createState() => _DemoState();
}

class _DemoState extends State<Demo> with SingleTickerProviderStateMixin {
  final scroll = ScrollController();
  final field = TextEditingController();
  int frame = 0;
  final times = <int>[];

  @override
  void initState() {
    super.initState();
    SchedulerBinding.instance.addTimingsCallback((ts) {
      for (final t in ts) { times.add(t.totalSpan.inMicroseconds); }
      if (times.length >= 300 && Platform.environment['PC_REPORT'] != null) {
        final s = [...times]..sort();
        stdout.writeln('frame total us p50=${s[s.length ~/ 2]} p99=${s[(s.length * 0.99).floor()]} max=${s.last}');
        exit(0);
      }
    });
    if (mode != 'hello') {
      SchedulerBinding.instance.scheduleFrameCallback(_tick);
    }
  }

  void _tick(Duration d) {
    frame++;
    if (mode == 'list' && scroll.hasClients && scroll.position.hasContentDimensions) {
      final down = frame % 400 < 200;
      final y = (scroll.offset + (down ? 40 : -40)).clamp(0.0, scroll.position.maxScrollExtent);
      scroll.jumpTo(y);
    } else if (mode == 'anim') {
      setState(() {});
    } else if (mode == 'input') {
      if (frame > 3) { field.text += 'x'; field.selection = TextSelection.collapsed(offset: field.text.length); setState(() {}); }
    }
    SchedulerBinding.instance.scheduleFrameCallback(_tick);
  }

  @override
  Widget build(BuildContext context) {
    switch (mode) {
      case 'list':
        return Scaffold(body: ListView.builder(
          controller: scroll, itemCount: 1000, itemExtent: 48,
          itemBuilder: (c, i) => Container(
            height: 48, padding: const EdgeInsets.symmetric(horizontal: 16), alignment: Alignment.centerLeft,
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xffe2e8f0)))),
            child: Text('Row $i', style: const TextStyle(fontSize: 16, color: Color(0xff1e293b))))));
      case 'anim':
        return Scaffold(body: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('$frame', style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          Container(width: 256, height: 16, decoration: BoxDecoration(color: const Color(0xffe2e8f0), borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.centerLeft,
            child: Container(width: (frame % 256).toDouble(), height: 16, decoration: BoxDecoration(color: const Color(0xff3b82f6), borderRadius: BorderRadius.circular(8)))),
        ])));
      case 'input':
        return Scaffold(body: Padding(padding: const EdgeInsets.all(24), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          TextField(controller: field, autofocus: true, decoration: const InputDecoration(hintText: 'type here', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          Text('${field.text.length} chars'),
        ])));
      default:
        return const Scaffold(body: Center(child: Text('Hello, perf', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold))));
    }
  }
}
