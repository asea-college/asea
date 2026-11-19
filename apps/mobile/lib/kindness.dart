import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class KindnessPage extends StatefulWidget {
  const KindnessPage({super.key});
  @override
  State<KindnessPage> createState() => _KindnessPageState();
}

class _KindnessPageState extends State<KindnessPage> {
  final sb = Supabase.instance.client;
  final note = TextEditingController();
  List<Map<String, dynamic>> directory = [];
  List<Map<String, dynamic>> inbox = [];
  String? recipient;
  String targetName = '배정 대기 중';
  String mission = '평일 오전 9시 마니또 미션을 확인하세요.';
  String feedback = '';
  bool optedOut = false;
  bool completed = false;
  bool assigned = false;
  bool busy = false;

  static const missionText = {
    'greeting': '먼저 미소 지으며 인사를 나눠 보세요.',
    'gratitude': '작은 감사 한마디를 건네 보세요.',
    'help': '도움이 필요한 작은 일을 찾아 보세요.',
    'encourage': '응원하는 한마디를 전해 보세요.',
    'coffee_optional': '10분 대화나 커피 한 잔을 제안해 보세요. 구매는 선택입니다.',
  };
  @override
  void initState() { super.initState(); refresh(); }
  @override
  void dispose() { note.dispose(); super.dispose(); }

  Future<void> refresh() async {
    try {
      final status = await sb.rpc('notice_kindness_my_status');
      final messages = await sb.rpc('notice_kindness_inbox');
      final staff = await sb.rpc('notice_staff_directory');
      final rows = List<Map<String, dynamic>>.from(status as List);
      final row = rows.isEmpty ? <String, dynamic>{} : rows.first;
      if (!mounted) return;
      setState(() {
        optedOut = row['opted_out'] == true;
        assigned = row['mission_day'] != null;
        completed = row['completed'] == true;
        targetName = optedOut ? '참여 중지됨'
          : (row['recipient_name']?.toString() ?? '오늘 배정을 기다리고 있습니다.');
        mission = missionText[row['mission_code']] ?? '새 미션이 도착하면 표시됩니다.';
        directory = List<Map<String, dynamic>>.from(staff as List)
          .where((x) => x['id'] != sb.auth.currentUser?.id).toList();
        inbox = List<Map<String, dynamic>>.from(messages as List);
        feedback = '';
      });
    } catch (e) {
      if (mounted) setState(() => feedback = e.toString());
    }
  }

  Future<void> optOut(bool value) async {
    setState(() => busy = true);
    try {
      await sb.rpc('notice_kindness_opt', params: {'p_opt_out': value});
      await refresh();
    } catch (e) {
      if (mounted) setState(() => feedback = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
  Future<void> complete() async {
    setState(() => busy = true);
    try {
      await sb.rpc('notice_kindness_complete');
      await refresh();
    } catch (e) {
      if (mounted) setState(() => feedback = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
  Future<void> sendNote() async {
    if (recipient == null || note.text.trim().length < 4) {
      setState(() => feedback = '받는 동료와 4자 이상의 메시지를 입력하십시오.');
      return;
    }
    setState(() => busy = true);
    try {
      await sb.rpc('notice_kindness_send', params: {
        'p_recipient': recipient, 'p_channel': 'anonymous_thanks',
        'p_body': note.text.trim()
      });
      note.clear();
      if (mounted) setState(() => feedback = '익명 감사 메시지를 전달했습니다.');
    } catch (e) {
      if (mounted) setState(() => feedback = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('아세아 이음 · 오늘의 작은 이음'),
      actions: [IconButton(onPressed: refresh, icon: const Icon(Icons.refresh))]),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      Card(color: const Color(0xffe8f1ff), child: Padding(
        padding: const EdgeInsets.all(20), child: Column(
          crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('🎁 오늘의 마니또', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            Text(targetName, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8), Text(mission),
            const SizedBox(height: 16),
            FilledButton(onPressed: (!assigned || completed || optedOut || busy) ? null : complete,
              child: Text(completed ? '오늘 미션 완료' : '완료 표시')),
          ]))),
      const SizedBox(height: 10),
      SwitchListTile(title: const Text('마니또 참여 중지'),
        subtitle: const Text('언제든 다음 배정부터 참여하지 않을 수 있습니다.'),
        value: optedOut, onChanged: busy ? null : optOut),
      const Divider(),
      const Text('💌 익명 감사 우체통', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
      DropdownButtonFormField<String>(
        initialValue: recipient,
        hint: const Text('받는 동료 선택'),
        items: directory.map((p) => DropdownMenuItem<String>(
          value: p['id'].toString(), child: Text(p['full_name'].toString()))).toList(),
        onChanged: (v) => setState(() => recipient = v)),
      const SizedBox(height: 9),
      TextField(controller: note, maxLength: 500, maxLines: 3,
        decoration: const InputDecoration(border: OutlineInputBorder(),
          hintText: '오늘 도와주셔서 고맙습니다!')),
      FilledButton(onPressed: busy ? null : sendNote,
        child: const Text('익명 응원 보내기')),
      const Text('익명은 받는 사람에게만 적용됩니다. 서버에는 운영·신고 처리를 위한 기록이 남습니다.',
        style: TextStyle(fontSize: 12, color: Colors.grey)),
      const SizedBox(height: 12),
      if (feedback.isNotEmpty) Text(feedback, style: const TextStyle(color: Colors.deepOrange)),
      const Divider(),
      const Text('📬 내게 도착한 응원', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
      if (inbox.isEmpty) const ListTile(title: Text('아직 도착한 익명 응원이 없습니다.')),
      ...inbox.map((x) => Card(child: ListTile(
        leading: const Icon(Icons.favorite_outline),
        title: Text(x['body'].toString()),
        subtitle: Text((x['created_at'] ?? '').toString())))),
      const SizedBox(height: 20),
      const Text('☕ 커피 메이트 · 🌱 선한 행동 · 🔗 부서 릴레이 · 📻 방송국 사연함은 웹 소통센터에서 먼저 제공하며, 모바일 전용 기능은 단계적으로 연결합니다.',
        style: TextStyle(fontSize: 13, color: Colors.grey)),
    ]));
}
