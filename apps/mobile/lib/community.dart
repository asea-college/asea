import 'dart:math';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CommunityPage extends StatefulWidget {
 const CommunityPage({super.key});
 @override State<CommunityPage> createState()=>_CommunityPageState();
}
class _CommunityPageState extends State<CommunityPage> {
 final sb=Supabase.instance.client;
 final question=TextEditingController(),options=TextEditingController();
 List<Map<String,dynamic>> rooms=[],polls=[],broadcasts=[];
 String? room;String kind='poll',error='';bool anonymous=false,multiple=false;
 DateTime? end;
 final rnd=Random.secure();
 @override void initState(){super.initState();reload();}
 @override void dispose(){question.dispose();options.dispose();super.dispose();}
 Future<void> reload()async{
 try{
  final a=await sb.from('notice_rooms').select('id,title');
  final b=await sb.from('notice_polls').select('id,question,kind,closes_at,anonymous,multiple').order('created_at',ascending:false).limit(50);
  final c=await sb.from('notice_radio_schedule').select('title,starts_at').order('starts_at').limit(20);
  if(mounted)setState((){rooms=List<Map<String,dynamic>>.from(a);polls=List<Map<String,dynamic>>.from(b);broadcasts=List<Map<String,dynamic>>.from(c);if(!rooms.any((r)=>r['id']==room))room=rooms.isNotEmpty?rooms.first['id'].toString():null;error='';});
 }catch(e){if(mounted)setState(()=>error=e.toString());}
 }
 Future<void> setDeadline()async{
 final d=await showDatePicker(context:context,firstDate:DateTime.now(),lastDate:DateTime.now().add(const Duration(days:365)),initialDate:DateTime.now().add(const Duration(days:1)));
 if(d==null||!mounted)return;
 final t=await showTimePicker(context:context,initialTime:const TimeOfDay(hour:18,minute:0));
 if(t!=null&&mounted)setState(()=>end=DateTime(d.year,d.month,d.day,t.hour,t.minute));
 }
 Future<void> create()async{
 try{
  final items=options.text.split('\n').map((s)=>s.trim()).where((s)=>s.isNotEmpty).toSet().toList();
  if(room==null||question.text.trim().length<3||items.length<2||items.length>15||end==null||!end!.isAfter(DateTime.now()))throw Exception('대화방, 제목, 선택지 2~15개, 미래 마감일을 입력하십시오.');
  final a=await sb.from('notice_polls').insert({'room_id':room,'author_id':sb.auth.currentUser!.id,'question':question.text.trim(),'kind':kind,'anonymous':anonymous,'multiple':multiple,'closes_at':end!.toUtc().toIso8601String()}).select('id').single();
  await sb.from('notice_poll_options').insert(items.map((s)=>{'poll_id':a['id'],'label':s}).toList());
  question.clear();options.clear();await reload();
 }catch(e){if(mounted)setState(()=>error=e.toString());}
 }
 void alert(String title,String message){showDialog<void>(context:context,builder:(ctx)=>AlertDialog(title:Text(title),content:Text(message),actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('확인'))]));}
 void play(){const a=['가위','바위','보'];showDialog<void>(context:context,builder:(ctx)=>SimpleDialog(title:const Text('가위바위보'),children:a.map((item)=>SimpleDialogOption(child:Text(item),onPressed:(){Navigator.pop(ctx);final x=a.indexOf(item),y=rnd.nextInt(3);alert('가위바위보','상대: '+a[y]+' / '+(x==y?'무승부':(x+1)%3==y?'패배':'승리'));})).toList()));}
 void teams(){final names=TextEditingController();showDialog<void>(context:context,builder:(ctx)=>AlertDialog(title:const Text('랜덤 팀 추첨'),content:TextField(controller:names,maxLines:5,decoration:const InputDecoration(hintText:'참가자를 줄마다 입력')),actions:[FilledButton(onPressed:(){final l=names.text.split('\n').where((v)=>v.trim().isNotEmpty).toList()..shuffle(rnd);Navigator.pop(ctx);alert('팀 결과',l.asMap().entries.map((e)=>(e.key%2+1).toString()+'팀: '+e.value).join('\n'));},child:const Text('추첨'))]));}
 @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('이음 소통센터'),actions:[IconButton(onPressed:reload,icon:const Icon(Icons.refresh))]),
 body:ListView(padding:const EdgeInsets.all(14),children:[
  if(error.isNotEmpty)Text(error,style:const TextStyle(color:Colors.deepOrange)),
  const Text('투표 · 일정 조율',style:TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
  DropdownButtonFormField<String>(initialValue:room,decoration:const InputDecoration(labelText:'대화방'),items:rooms.map((r)=>DropdownMenuItem<String>(value:r['id'].toString(),child:Text(r['title'].toString()))).toList(),onChanged:(v)=>setState(()=>room=v)),
  DropdownButtonFormField<String>(initialValue:kind,decoration:const InputDecoration(labelText:'유형'),items:const [DropdownMenuItem(value:'poll',child:Text('투표')),DropdownMenuItem(value:'schedule',child:Text('일정 조율'))],onChanged:(v)=>setState(()=>kind=v??'poll')),
  TextField(controller:question,decoration:const InputDecoration(labelText:'질문 또는 일정 제목')),
  TextField(controller:options,maxLines:4,decoration:const InputDecoration(labelText:'후보 항목 (한 줄에 하나씩)')),
  SwitchListTile(title:const Text('익명 투표'),value:anonymous,onChanged:(v)=>setState(()=>anonymous=v)),
  SwitchListTile(title:const Text('복수 응답'),value:multiple,onChanged:(v)=>setState(()=>multiple=v)),
  TextButton(onPressed:setDeadline,child:Text(end==null?'마감일 선택':end.toString().substring(0,16))),
  FilledButton(onPressed:create,child:const Text('새 투표·일정 등록')),
  const Divider(),const Text('투표 및 응답',style:TextStyle(fontSize:20,fontWeight:FontWeight.bold)),
  ...polls.map((p)=>ListTile(title:Text(p['question'].toString()),subtitle:Text(p['kind'].toString()),onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>PollPage(poll:p))))),
  const Divider(),const Text('함께 웃는 소통',style:TextStyle(fontSize:20,fontWeight:FontWeight.bold)),
  ListTile(title:const Text('✊ 가위바위보'),onTap:play),
  ListTile(title:const Text('🍚 랜덤 점심'),onTap:()=>alert('오늘의 점심',['국수','비빔밥','돈가스','김치찌개','샐러드'][rnd.nextInt(5)])),
  ListTile(title:const Text('👥 팀 무작위 추첨'),onTap:teams),
  ListTile(title:const Text('💬 오늘의 질문'),onTap:()=>alert('오늘의 대화',['오늘 감사한 동료는?','다른 부서에서 배운 것은?','추천하고 싶은 작은 습관은?'][rnd.nextInt(3)])),
  const Divider(),const Text('📻 이음 방송국',style:TextStyle(fontSize:20,fontWeight:FontWeight.bold)),
  ...broadcasts.map((b)=>ListTile(title:Text(b['title'].toString()),subtitle:Text(b['starts_at'].toString()))),
  const Text('방송 사연과 음악 송출은 권리 확인 및 검토 절차가 필요합니다.',style:TextStyle(color:Colors.grey)),
 ]));
}
class PollPage extends StatefulWidget{
 final Map<String,dynamic> poll;
 const PollPage({super.key,required this.poll});
 @override State<PollPage> createState()=>_PollPageState();
}
class _PollPageState extends State<PollPage>{
 final sb=Supabase.instance.client;
 List<Map<String,dynamic>> options=[],tally=[];String error='';
 @override void initState(){super.initState();load();}
 Future<void> load()async{try{final a=await sb.from('notice_poll_options').select('id,label').eq('poll_id',widget.poll['id']);final b=await sb.rpc('notice_poll_tally',params:{'p_poll':widget.poll['id']});if(mounted)setState((){options=List<Map<String,dynamic>>.from(a);tally=List<Map<String,dynamic>>.from(b as List);});}catch(e){if(mounted)setState(()=>error=e.toString());}}
 Future<void> vote(String id)async{try{await sb.rpc('notice_cast_vote',params:{'p_poll':widget.poll['id'],'p_option':id});await load();}catch(e){if(mounted)setState(()=>error=e.toString());}}
 @override Widget build(BuildContext context){final closed=DateTime.tryParse(widget.poll['closes_at'].toString())?.isBefore(DateTime.now())??true;return Scaffold(appBar:AppBar(title:const Text('응답·결과')),body:ListView(padding:const EdgeInsets.all(16),children:[
 Text(widget.poll['question'].toString(),style:const TextStyle(fontSize:22,fontWeight:FontWeight.bold)),if(error.isNotEmpty)Text(error,style:const TextStyle(color:Colors.red)),
 ...options.map((o)=>ListTile(title:Text(o['label'].toString()),subtitle:Text(tally.where((t)=>t['option_id']==o['id']).map((t)=>t['votes'].toString()+'표').join()),trailing:FilledButton(onPressed:closed?null:()=>vote(o['id'].toString()),child:const Text('선택')))),
 ]));}
}
