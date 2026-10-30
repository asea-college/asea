using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ASEA.Notice {
  internal static class Program {
    [STAThread] static void Main() {
      ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
      Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
      Application.Run(new TrayApp());
    }
  }
  internal sealed class TrayApp: ApplicationContext {
    readonly NotifyIcon icon;
    readonly Timer tick;
    readonly HttpClient http=new HttpClient();
    readonly JavaScriptSerializer json=new JavaScriptSerializer();
    readonly string configPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ASEA","Notice","config.json");
    readonly HashSet<string> shown=new HashSet<string>();
    string server="",publishableKey="",accessToken="",userId="";
    bool checking;
    public TrayApp(){
      Directory.CreateDirectory(Path.GetDirectoryName(configPath));
      ReadConfig(); RegisterStartup();
      icon=new NotifyIcon{Icon=SystemIcons.Information,Text="ASEA 통합 업무 알림",Visible=true};
      var menu=new ContextMenuStrip();
      menu.Items.Add("로그인 / 계정 전환",null,(s,e)=>Login());
      menu.Items.Add("공지 확인",null,async(s,e)=>await CheckNotices(true));
      menu.Items.Add("학교 일정표",null,(s,e)=>OpenCalendar());
      menu.Items.Add("로그아웃",null,(s,e)=>Logout());
      menu.Items.Add("종료",null,(s,e)=>ExitThread());
      icon.ContextMenuStrip=menu;icon.DoubleClick+=(s,e)=>OpenCalendar();
      tick=new Timer{Interval=60000};tick.Tick+=async(s,e)=>await CheckNotices();tick.Start();
      Login();
    }
    void OpenCalendar(){System.Diagnostics.Process.Start("https://bangdw-hash.github.io/asea-calendar-management/schedule.html");}
    void ReadConfig(){try{if(File.Exists(configPath)){var c=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(configPath));c.TryGetValue("url",out server);c.TryGetValue("publishable_key",out publishableKey);}}catch{}}
    void SaveConfig(){var c=new Dictionary<string,string>{{"url",server},{"publishable_key",publishableKey}};File.WriteAllText(configPath,json.Serialize(c));}
    void RegisterStartup(){try{using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run",true)){if(key!=null)key.SetValue("ASEA Notice","\""+Application.ExecutablePath+"\"");}}catch{}}
    async Task<string> Call(string endpoint,HttpMethod method,string content=null){
      using(var req=new HttpRequestMessage(method,server.TrimEnd('/')+endpoint)){
        req.Headers.TryAddWithoutValidation("apikey",publishableKey);
        req.Headers.TryAddWithoutValidation("Authorization","Bearer "+(string.IsNullOrEmpty(accessToken)?publishableKey:accessToken));
        if(content!=null)req.Content=new StringContent(content,Encoding.UTF8,"application/json");
        using(var response=await http.SendAsync(req)){
          var body=await response.Content.ReadAsStringAsync();
          if(!response.IsSuccessStatusCode)throw new Exception("서버 HTTP "+(int)response.StatusCode);
          return body;
        }
      }
    }
    void Login(){
      using(var form=new Form{Text="ASEA 교직원 로그인",Width=440,Height=360,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false}){
        var panel=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(18),ColumnCount=1,RowCount=9};
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var url=new TextBox{Text=server??""};var key=new TextBox{Text=publishableKey??""};
        var email=new TextBox();var password=new TextBox{UseSystemPasswordChar=true};
        panel.Controls.Add(new Label{Text="Supabase URL",AutoSize=true});panel.Controls.Add(url);
        panel.Controls.Add(new Label{Text="공개용 Publishable key",AutoSize=true});panel.Controls.Add(key);
        panel.Controls.Add(new Label{Text="교직원 이메일",AutoSize=true});panel.Controls.Add(email);
        panel.Controls.Add(new Label{Text="비밀번호",AutoSize=true});panel.Controls.Add(password);
        var button=new Button{Text="로그인",Height=32,Dock=DockStyle.Fill};panel.Controls.Add(button);form.Controls.Add(panel);
        button.Click+=async(s,e)=>{
          try{
            Uri uri;
            if(!Uri.TryCreate(url.Text.Trim(),UriKind.Absolute,out uri)||uri.Scheme!="https"||!uri.Host.EndsWith(".supabase.co",StringComparison.OrdinalIgnoreCase))throw new Exception("프로젝트 주소를 확인하십시오.");
            if(key.Text.StartsWith("sb_secret_",StringComparison.OrdinalIgnoreCase))throw new Exception("공개용 키만 입력하십시오.");
            server=url.Text.Trim();publishableKey=key.Text.Trim();
            var payload=json.Serialize(new Dictionary<string,string>{{"email",email.Text.Trim()},{"password",password.Text}});
            var result=json.Deserialize<Dictionary<string,object>>(await Call("/auth/v1/token?grant_type=password",HttpMethod.Post,payload));
            accessToken=Convert.ToString(result["access_token"]);
            var user=(Dictionary<string,object>)result["user"];userId=Convert.ToString(user["id"]);
            SaveConfig();shown.Clear();form.Close();icon.BalloonTipTitle="ASEA 로그인 완료";icon.BalloonTipText="트레이 아이콘을 오른쪽 클릭하여 공지와 일정표를 확인할 수 있습니다.";icon.ShowBalloonTip(3500);await CheckNotices();
          }catch(Exception ex){MessageBox.Show(ex.Message,"로그인 오류");}
        };
        form.ShowDialog();
      }
    }
    async Task CheckNotices(bool notifyWhenEmpty=false){
      if(checking||string.IsNullOrEmpty(accessToken)||string.IsNullOrEmpty(userId))return;
      checking=true;
      try{
        var result=json.DeserializeObject(await Call("/rest/v1/notice_announcements?select=id,title,blocks,response_type&status=eq.published&order=created_at.desc&limit=50",HttpMethod.Get));
        var notices=result as object[];if(notices==null)return;if(notices.Length==0 && notifyWhenEmpty){MessageBox.Show("현재 확인 가능한 공지가 없습니다.","ASEA 공지");return;}
        foreach(var entry in notices){
          var n=entry as Dictionary<string,object>;if(n==null)continue;
          var id=Convert.ToString(n["id"]);if(shown.Contains(id))continue;
          shown.Add(id);
          await ConfirmNotice(n);
        }
      }catch(Exception ex){icon.BalloonTipTitle="ASEA 연결 상태";icon.BalloonTipText=ex.Message;icon.ShowBalloonTip(2000);}
      finally{checking=false;}
    }
    async Task ConfirmNotice(Dictionary<string,object> n){
      string id=Convert.ToString(n["id"]),title=Convert.ToString(n["title"]),rtype=Convert.ToString(n["response_type"]);
      using(var form=new Form{Text="ASEA 확인 필요 공지",Width=480,Height=335,StartPosition=FormStartPosition.CenterScreen,ControlBox=false,TopMost=true}){
        var panel=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(18),RowCount=4,ColumnCount=1};
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute,45));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute,65));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute,44));
        var heading=new Label{Text=title,Dock=DockStyle.Fill,Font=new Font("Malgun Gothic",12,FontStyle.Bold)};
        var description=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill};
        if(n.ContainsKey("blocks"))description.Text=json.Serialize(n["blocks"]);
        var input=new TextBox{Dock=DockStyle.Fill,Multiline=true,Visible=rtype=="comment"};
        var submit=new Button{Text="확인 및 전송",Dock=DockStyle.Fill};
        panel.Controls.Add(heading,0,0);panel.Controls.Add(description,0,1);panel.Controls.Add(input,0,2);panel.Controls.Add(submit,0,3);form.Controls.Add(panel);
        submit.Click+=async(s,e)=>{
          try{
            if(rtype=="comment"&&string.IsNullOrWhiteSpace(input.Text)){MessageBox.Show("의견을 입력하십시오.");return;}
            var payload=json.Serialize(new Dictionary<string,object>{
              {"notice_id",id},{"person_id",userId},{"answer",rtype=="comment"?"comment":"ack"},
              {"comment",rtype=="comment"?input.Text:null},{"client_request_id",Guid.NewGuid().ToString()}
            });
            await Call("/rest/v1/notice_responses",HttpMethod.Post,payload);
            form.DialogResult=DialogResult.OK;form.Close();
          }catch(Exception ex){MessageBox.Show(ex.Message+"\n서버 저장 실패로 창을 유지합니다.","전송 실패");}
        };
        form.ShowDialog();
      }
    }
    void Logout(){accessToken="";userId="";shown.Clear();MessageBox.Show("로그아웃되었습니다. 다시 로그인하려면 트레이 아이콘을 선택하십시오.");}
    protected override void ExitThreadCore(){tick.Stop();icon.Visible=false;icon.Dispose();http.Dispose();base.ExitThreadCore();}
  }
}
