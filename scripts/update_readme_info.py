import os
import re

def get_requirements():
    req_file = 'requirements.txt'
    if not os.path.exists(req_file):
        return []
    with open(req_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    packages = []
    for line in lines:
        line = line.strip()
        if line and not line.startswith('#'):
            pkg = re.split('[<>=]', line)[0].strip()
            packages.append(pkg)
    return packages

def update_readme(packages):
    readme_file = 'README.md'
    if not os.path.exists(readme_file):
        print("README.md not found.")
        return

    with open(readme_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define core project techs that might not be in requirements.txt
    core_techs = [
        ('Javascript', '核心邏輯與互動實作。'),
        ('Chart.js', '各式數據圖表視覺化。'),
        ('Ionicons', '現代化 UI 圖示集。'),
        ('Google Apps Script', '無伺服器後端 API。')
    ]

    tech_section = "## 🔧 核心技術\n<!-- TECH_START -->\n"
    
    # Add core techs first
    for name, desc in core_techs:
        tech_section += f"- **{name}**: {desc}\n"

    # Add python packages from requirements
    descriptions = {
        'requests': '用於自動化腳本的 HTTP 請求。',
        'pandas': '用於數據處理與報告生成。',
        'pyyaml': 'YAML 配置文件處理。'
    }

    for pkg in packages:
        if pkg.lower() in [t[0].lower() for t in core_techs]: continue
        desc = descriptions.get(pkg.lower(), '輔助腳本依賴。')
        tech_section += f"- **{pkg.capitalize()}**: {desc}\n"
    
    tech_section += "<!-- TECH_END -->"

    pattern = r"## 🔧 核心技術\n<!-- TECH_START -->.*?<!-- TECH_END -->"
    if re.search(pattern, content, flags=re.DOTALL):
        new_content = re.sub(pattern, tech_section, content, flags=re.DOTALL)
    else:
        # If section not found, append it or handle appropriately
        new_content = content + "\n\n" + tech_section

    with open(readme_file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("README.md updated successfully.")

if __name__ == "__main__":
    pkgs = get_requirements()
    update_readme(pkgs)
